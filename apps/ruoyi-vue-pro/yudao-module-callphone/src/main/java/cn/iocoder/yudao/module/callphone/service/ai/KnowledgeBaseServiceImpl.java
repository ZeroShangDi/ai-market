package cn.iocoder.yudao.module.callphone.service.ai;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBasePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBaseSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeBaseDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeChunkDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeDocumentDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.KnowledgeBaseMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.KnowledgeChunkMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.KnowledgeDocumentMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.infra.api.file.FileApi;
import cn.iocoder.yudao.module.system.api.dept.DeptApi;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import jakarta.annotation.Resource;
import java.io.IOException;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.multipart.MultipartFile;

import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Service
@Validated
public class KnowledgeBaseServiceImpl implements KnowledgeBaseService {

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;
    private static final int CHUNK_SIZE = 1200;
    private static final int CHUNK_OVERLAP = 120;

    @Resource private KnowledgeBaseMapper knowledgeBaseMapper;
    @Resource private KnowledgeDocumentMapper knowledgeDocumentMapper;
    @Resource private KnowledgeChunkMapper knowledgeChunkMapper;
    @Resource private FileApi fileApi;
    @Resource private PiiCryptoService cryptoService;
    @Resource private DeptApi deptApi;
    @Resource private AdminUserApi adminUserApi;

    @Override
    public PageResult<KnowledgeBaseDO> getPage(KnowledgeBasePageReqVO reqVO) {
        Long userDepartmentId = currentDepartmentId();
        List<KnowledgeBaseDO> visible = knowledgeBaseMapper.selectList(new LambdaQueryWrapperX<KnowledgeBaseDO>()
                        .eqIfPresent(KnowledgeBaseDO::getStatus, reqVO.getStatus())
                        .and(reqVO.getQuery() != null && !reqVO.getQuery().isBlank(), wrapper -> wrapper
                                .like(KnowledgeBaseDO::getName, reqVO.getQuery())
                                .or().like(KnowledgeBaseDO::getDescription, reqVO.getQuery()))
                        .orderByDesc(KnowledgeBaseDO::getUpdateTime, KnowledgeBaseDO::getId))
                .stream().filter(row -> canAccess(row, userDepartmentId)).toList();
        long offset = (long) (reqVO.getPageNo() - 1) * reqVO.getPageSize();
        int from = (int) Math.min(offset, visible.size());
        int to = Math.min(from + reqVO.getPageSize(), visible.size());
        return new PageResult<>(visible.subList(from, to), (long) visible.size());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long save(KnowledgeBaseSaveReqVO reqVO) {
        if (!List.of("workspace", "teams").contains(reqVO.getVisibility())
                || ("teams".equals(reqVO.getVisibility()) && reqVO.getVisibleDepartmentIds().isEmpty())) {
            throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_VISIBILITY_INVALID);
        }
        if (!reqVO.getVisibleDepartmentIds().isEmpty()) deptApi.validateDeptList(reqVO.getVisibleDepartmentIds());
        KnowledgeBaseDO row;
        if (reqVO.getId() != null) {
            row = knowledgeBaseMapper.selectById(reqVO.getId());
            if (row == null || !canAccess(row)) throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_BASE_INVALID);
        } else {
            row = new KnowledgeBaseDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setStatus("enabled");
            row.setDocumentCount(0);
            row.setChunkCount(0);
        }
        row.setName(reqVO.getName().trim());
        row.setDescription(reqVO.getDescription() == null ? "" : reqVO.getDescription().trim());
        row.setVisibility(reqVO.getVisibility());
        row.setVisibleDepartmentIdsJson(JsonUtils.toJsonString(reqVO.getVisibleDepartmentIds()));
        if (reqVO.getId() == null) knowledgeBaseMapper.insert(row); else knowledgeBaseMapper.updateById(row);
        return row.getId();
    }

    @Override
    public boolean setStatus(Long id, String status) {
        if (!List.of("enabled", "disabled").contains(status)) return false;
        KnowledgeBaseDO row = knowledgeBaseMapper.selectById(id);
        if (row == null || !canAccess(row)) return false;
        row.setStatus(status);
        return knowledgeBaseMapper.updateById(row) > 0;
    }

    @Override
    public List<KnowledgeDocumentDO> getDocuments(Long knowledgeBaseId) {
        requireAccessible(knowledgeBaseId);
        return knowledgeDocumentMapper.selectByKnowledgeBaseId(knowledgeBaseId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeDocumentDO upload(Long knowledgeBaseId, MultipartFile file) throws IOException {
        KnowledgeBaseDO base = requireEnabled(knowledgeBaseId);
        if (file == null || file.isEmpty() || file.getSize() > MAX_FILE_SIZE || !isAllowed(file.getOriginalFilename())) {
            throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_FILE_INVALID);
        }
        byte[] bytes = file.getBytes();
        String content;
        try {
            content = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) {
            throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_FILE_INVALID);
        }
        if (content.isBlank()) throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_FILE_INVALID);
        String checksum = sha256(bytes);
        if (knowledgeDocumentMapper.selectByBaseAndChecksum(knowledgeBaseId, checksum) != null) {
            throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_DOCUMENT_DUPLICATED);
        }
        String sourceName = safeFilename(file.getOriginalFilename());
        String storageUrl = fileApi.createFile(bytes, sourceName, "callphone/knowledge/" + base.getId(), "text/plain; charset=utf-8");
        KnowledgeDocumentDO document = new KnowledgeDocumentDO();
        document.setId(IdUtil.getSnowflake().nextId());
        document.setKnowledgeBaseId(base.getId());
        document.setSourceName(sourceName);
        document.setStorageUrl(storageUrl);
        document.setContentType("text/plain; charset=utf-8");
        document.setByteSize(file.getSize());
        document.setChecksum(checksum);
        document.setRetryCount(0);
        document.setContentCiphertext(cryptoService.encrypt(content));
        List<String> chunks = split(content);
        saveChunks(document, chunks);
        document.setParseStatus("ready");
        document.setChunkCount(chunks.size());
        knowledgeDocumentMapper.insert(document);
        knowledgeBaseMapper.updateCounts(base.getId(), 1, chunks.size());
        return document;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean retryDocument(Long id) {
        KnowledgeDocumentDO document = knowledgeDocumentMapper.selectByIdForUpdate(id);
        if (document == null) {
            throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_DOCUMENT_NOT_FOUND);
        }
        KnowledgeBaseDO base = requireEnabled(document.getKnowledgeBaseId());
        int oldChunkCount = document.getChunkCount() == null ? 0 : document.getChunkCount();
        List<String> chunks = split(cryptoService.decrypt(document.getContentCiphertext()));
        for (KnowledgeChunkDO oldChunk : knowledgeChunkMapper.selectByDocumentId(id)) {
            knowledgeChunkMapper.deleteById(oldChunk.getId());
        }
        saveChunks(document, chunks);
        document.setParseStatus("ready");
        document.setChunkCount(chunks.size());
        document.setRetryCount(document.getRetryCount() == null ? 1 : document.getRetryCount() + 1);
        document.setErrorMessage(null);
        knowledgeDocumentMapper.updateById(document);
        knowledgeBaseMapper.updateCounts(base.getId(), 0, chunks.size() - oldChunkCount);
        return true;
    }

    private KnowledgeBaseDO requireEnabled(Long id) {
        KnowledgeBaseDO row = knowledgeBaseMapper.selectById(id);
        if (row == null || !"enabled".equals(row.getStatus()) || !canAccess(row)) throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_BASE_INVALID);
        return row;
    }

    private KnowledgeBaseDO requireAccessible(Long id) {
        KnowledgeBaseDO row = knowledgeBaseMapper.selectById(id);
        if (row == null || !canAccess(row)) throw new ServiceException(ErrorCodeConstants.KNOWLEDGE_BASE_INVALID);
        return row;
    }

    private boolean canAccess(KnowledgeBaseDO row) {
        return canAccess(row, currentDepartmentId());
    }

    private boolean canAccess(KnowledgeBaseDO row, Long userDepartmentId) {
        if ("workspace".equals(row.getVisibility())) return true;
        if (!"teams".equals(row.getVisibility())) return false;
        if (userDepartmentId == null) return false;
        List<Long> departmentIds = JsonUtils.parseArray(row.getVisibleDepartmentIdsJson(), Long.class);
        return departmentIds != null && departmentIds.stream().anyMatch(id -> Objects.equals(id, userDepartmentId));
    }

    private Long currentDepartmentId() {
        AdminUserRespDTO user = adminUserApi.getUser(getLoginUserId());
        return user == null ? null : user.getDeptId();
    }

    private void saveChunks(KnowledgeDocumentDO document, List<String> chunks) {
        for (int i = 0; i < chunks.size(); i++) {
            KnowledgeChunkDO chunk = new KnowledgeChunkDO();
            chunk.setId(IdUtil.getSnowflake().nextId());
            chunk.setKnowledgeBaseId(document.getKnowledgeBaseId());
            chunk.setDocumentId(document.getId());
            chunk.setChunkNo(i + 1);
            chunk.setCharCount(chunks.get(i).length());
            chunk.setContentCiphertext(cryptoService.encrypt(chunks.get(i)));
            knowledgeChunkMapper.insert(chunk);
        }
    }

    private List<String> split(String content) {
        String normalized = content.replace("\r\n", "\n").replace('\r', '\n').trim();
        List<String> chunks = new ArrayList<>();
        if (normalized.isEmpty()) return chunks;
        for (int start = 0; start < normalized.length();) {
            int end = Math.min(normalized.length(), start + CHUNK_SIZE);
            if (end < normalized.length()) {
                int boundary = normalized.lastIndexOf('\n', end);
                if (boundary > start + CHUNK_SIZE / 2) end = boundary;
            }
            chunks.add(normalized.substring(start, end).trim());
            if (end >= normalized.length()) break;
            start = Math.max(start + 1, end - CHUNK_OVERLAP);
        }
        return chunks;
    }

    private boolean isAllowed(String filename) {
        if (filename == null) return false;
        String lower = filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".txt") || lower.endsWith(".md");
    }

    private String safeFilename(String filename) {
        String value = filename == null ? "document.txt" : filename.replaceAll("[\\\\/\\r\\n]", "_");
        return value.length() > 180 ? value.substring(value.length() - 180) : value;
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}

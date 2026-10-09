package cn.iocoder.yudao.module.callphone.service.ai;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptSaveDraftReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiScriptTemplateDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.ai.AiScriptTemplateMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class AiScriptTemplateService {

    private static final Set<String> ALLOWED_CHANNELS = Set.of("phone", "wechat", "in_person");
    private static final Set<String> ALLOWED_VARIABLES = Set.of("customerName", "ownerName", "companyName", "need", "product", "objection");
    private static final Pattern TOKEN_PATTERN = Pattern.compile("\\{\\{\\s*([a-zA-Z][a-zA-Z0-9_]*)\\s*\\}\\}");

    @Resource private AiScriptTemplateMapper mapper;
    @Resource private CustomerStageMapper stageMapper;
    @Resource private PiiCryptoService cryptoService;

    public PageResult<AiScriptTemplateDO> getPage(AiScriptPageReqVO reqVO) {
        return mapper.selectPage(reqVO);
    }

    public AiScriptTemplateDO get(Long id) {
        return mapper.selectById(id);
    }

    public String decryptContent(AiScriptTemplateDO row) {
        return row == null ? null : cryptoService.decrypt(row.getContentCiphertext());
    }

    @Transactional(rollbackFor = Exception.class)
    public AiScriptTemplateDO saveDraft(AiScriptSaveDraftReqVO reqVO, Long userId) {
        validate(reqVO);
        AiScriptTemplateDO row;
        if (reqVO.getId() == null) {
            row = new AiScriptTemplateDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setTemplateKey(IdUtil.fastSimpleUUID());
            row.setVersionNo(1);
            row.setStatus("draft");
            row.setUsageCount(0);
            row.setCopyCount(0);
            row.setCreatedBy(userId);
        } else {
            row = mapper.selectById(reqVO.getId());
            if (row == null || !"draft".equals(row.getStatus())) throw exception(ErrorCodeConstants.AI_SCRIPT_STATE_CONFLICT);
        }
        row.setName(reqVO.getName().trim());
        row.setStageCode(blankToNull(reqVO.getStageCode()));
        row.setChannel(reqVO.getChannel());
        row.setTagsJson(JSONUtil.toJsonStr(reqVO.getTags() == null ? List.of() : reqVO.getTags().stream().map(String::trim).filter(tag -> !tag.isBlank()).distinct().toList()));
        row.setVariablesJson(JSONUtil.toJsonStr(reqVO.getVariables() == null ? List.of() : reqVO.getVariables().stream().distinct().toList()));
        row.setContentCiphertext(cryptoService.encrypt(reqVO.getContent().trim()));
        if (reqVO.getId() == null) mapper.insert(row); else mapper.updateById(row);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public AiScriptTemplateDO createVersion(Long sourceId, Long userId) {
        AiScriptTemplateDO source = mapper.selectById(sourceId);
        if (source == null || !Set.of("published", "superseded").contains(source.getStatus())) throw exception(ErrorCodeConstants.AI_SCRIPT_STATE_CONFLICT);
        AiScriptTemplateDO latest = mapper.selectLatestVersion(source.getTemplateKey());
        AiScriptTemplateDO draft = new AiScriptTemplateDO();
        draft.setId(IdUtil.getSnowflake().nextId());
        draft.setTemplateKey(source.getTemplateKey());
        draft.setVersionNo(latest.getVersionNo() + 1);
        draft.setName(source.getName()); draft.setStageCode(source.getStageCode()); draft.setChannel(source.getChannel());
        draft.setTagsJson(source.getTagsJson()); draft.setContentCiphertext(source.getContentCiphertext());
        draft.setVariablesJson(source.getVariablesJson()); draft.setStatus("draft"); draft.setUsageCount(0); draft.setCopyCount(0);
        draft.setCreatedBy(userId); mapper.insert(draft);
        return draft;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean publish(Long id, Long userId) {
        AiScriptTemplateDO draft = mapper.selectById(id);
        if (draft == null || !"draft".equals(draft.getStatus())) throw exception(ErrorCodeConstants.AI_SCRIPT_STATE_CONFLICT);
        AiScriptTemplateDO latest = mapper.selectLatestVersion(draft.getTemplateKey());
        if (latest == null || !latest.getId().equals(draft.getId())) throw exception(ErrorCodeConstants.AI_SCRIPT_STATE_CONFLICT);
        mapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<AiScriptTemplateDO>()
                .eq(AiScriptTemplateDO::getTemplateKey, draft.getTemplateKey())
                .eq(AiScriptTemplateDO::getStatus, "published")
                .set(AiScriptTemplateDO::getStatus, "superseded"));
        draft.setStatus("published"); draft.setPublishedAt(LocalDateTime.now()); draft.setPublishedBy(userId);
        return mapper.updateById(draft) > 0;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean recordUsage(Long id, String action) {
        if (!"copy".equals(action)) throw exception(ErrorCodeConstants.AI_SCRIPT_ACTION_INVALID);
        return mapper.recordUsage(id, true) > 0;
    }

    private void validate(AiScriptSaveDraftReqVO reqVO) {
        if (!ALLOWED_CHANNELS.contains(reqVO.getChannel())) throw exception(ErrorCodeConstants.AI_SCRIPT_VARIABLE_INVALID);
        if (reqVO.getStageCode() != null && !reqVO.getStageCode().isBlank()) {
            CustomerStageDO stage = stageMapper.selectByCode(reqVO.getStageCode());
            if (stage == null || !Boolean.TRUE.equals(stage.getEnabled())) throw exception(ErrorCodeConstants.AI_SCRIPT_STAGE_INVALID);
        }
        List<String> variables = reqVO.getVariables() == null ? List.of() : reqVO.getVariables().stream().distinct().toList();
        if (!ALLOWED_VARIABLES.containsAll(variables)) throw exception(ErrorCodeConstants.AI_SCRIPT_VARIABLE_INVALID);
        Matcher matcher = TOKEN_PATTERN.matcher(reqVO.getContent());
        while (matcher.find()) if (!variables.contains(matcher.group(1))) throw exception(ErrorCodeConstants.AI_SCRIPT_VARIABLE_INVALID);
        if (reqVO.getContent().contains("{{") && !matcher.reset().matches() && hasMalformedToken(reqVO.getContent())) {
            throw exception(ErrorCodeConstants.AI_SCRIPT_VARIABLE_INVALID);
        }
    }

    private boolean hasMalformedToken(String content) {
        String stripped = TOKEN_PATTERN.matcher(content).replaceAll("");
        return stripped.contains("{{") || stripped.contains("}}");
    }

    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}

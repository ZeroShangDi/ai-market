package cn.iocoder.yudao.module.callphone.controller.admin.ai;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.json.JsonUtils;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBasePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBaseRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeBaseSaveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.KnowledgeDocumentRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeBaseDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.KnowledgeDocumentDO;
import cn.iocoder.yudao.module.callphone.service.ai.KnowledgeBaseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - Call Phone 知识库")
@RestController
@RequestMapping("/callphone/knowledge-base")
@Validated
public class KnowledgeBaseController {

    @Resource private KnowledgeBaseService knowledgeBaseService;

    @GetMapping("/page")
    @Operation(summary = "知识库分页")
    @PreAuthorize("@ss.hasPermission('callphone:ai:knowledge:list')")
    public CommonResult<PageResult<KnowledgeBaseRespVO>> getPage(@Valid KnowledgeBasePageReqVO reqVO) {
        PageResult<KnowledgeBaseDO> page = knowledgeBaseService.getPage(reqVO);
        List<KnowledgeBaseRespVO> records = page.getList().stream().map(this::toBaseResp).toList();
        return success(new PageResult<>(records, page.getTotal()));
    }

    @PostMapping("/save")
    @Operation(summary = "新建或编辑知识库")
    @PreAuthorize("@ss.hasPermission('callphone:ai:knowledge:manage')")
    public CommonResult<Long> save(@Valid @org.springframework.web.bind.annotation.RequestBody KnowledgeBaseSaveReqVO reqVO) {
        return success(knowledgeBaseService.save(reqVO));
    }

    @PutMapping("/status")
    @Operation(summary = "启用或停用知识库")
    @PreAuthorize("@ss.hasPermission('callphone:ai:knowledge:manage')")
    public CommonResult<Boolean> setStatus(@RequestParam("id") Long id, @RequestParam("status") String status) {
        return success(knowledgeBaseService.setStatus(id, status));
    }

    @GetMapping("/documents")
    @Operation(summary = "查询知识库文档")
    @PreAuthorize("@ss.hasPermission('callphone:ai:knowledge:list')")
    public CommonResult<List<KnowledgeDocumentRespVO>> getDocuments(@RequestParam("knowledgeBaseId") Long knowledgeBaseId) {
        return success(BeanUtils.toBean(knowledgeBaseService.getDocuments(knowledgeBaseId), KnowledgeDocumentRespVO.class));
    }

    @PostMapping("/upload-document")
    @Operation(summary = "上传 TXT 或 Markdown 文档并创建检索切片")
    @PreAuthorize("@ss.hasPermission('callphone:ai:knowledge:upload')")
    public CommonResult<KnowledgeDocumentRespVO> upload(@RequestParam("knowledgeBaseId") Long knowledgeBaseId,
                                                         @RequestParam("file") MultipartFile file) throws IOException {
        return success(BeanUtils.toBean(knowledgeBaseService.upload(knowledgeBaseId, file), KnowledgeDocumentRespVO.class));
    }

    @PostMapping("/retry-document")
    @Operation(summary = "重新解析知识库文档并重建切片")
    @PreAuthorize("@ss.hasPermission('callphone:ai:knowledge:retry')")
    public CommonResult<Boolean> retry(@RequestParam("id") Long id) {
        return success(knowledgeBaseService.retryDocument(id));
    }

    private KnowledgeBaseRespVO toBaseResp(KnowledgeBaseDO row) {
        KnowledgeBaseRespVO respVO = BeanUtils.toBean(row, KnowledgeBaseRespVO.class);
        respVO.setVisibleDepartmentIds(JsonUtils.parseArray(row.getVisibleDepartmentIdsJson(), Long.class));
        if (respVO.getVisibleDepartmentIds() == null) respVO.setVisibleDepartmentIds(List.of());
        respVO.setCreateTime(row.getCreateTime());
        respVO.setUpdateTime(row.getUpdateTime());
        return respVO;
    }
}

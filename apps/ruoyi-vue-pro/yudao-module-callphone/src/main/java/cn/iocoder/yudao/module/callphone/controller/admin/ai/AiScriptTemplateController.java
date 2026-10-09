package cn.iocoder.yudao.module.callphone.controller.admin.ai;

import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptSaveDraftReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.ai.vo.AiScriptUsageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.ai.AiScriptTemplateDO;
import cn.iocoder.yudao.module.callphone.service.ai.AiScriptTemplateService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.util.collection.CollectionUtils.convertSet;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 话术助手")
@RestController
@RequestMapping("/callphone/ai-script-template")
@Validated
public class AiScriptTemplateController {

    @Resource private AiScriptTemplateService scriptService;
    @Resource private AdminUserApi adminUserApi;

    @GetMapping("/page")
    @Operation(summary = "查询话术版本分页")
    @PreAuthorize("@ss.hasPermission('callphone:ai:script:list')")
    public CommonResult<PageResult<AiScriptRespVO>> getPage(@Valid AiScriptPageReqVO reqVO) {
        PageResult<AiScriptTemplateDO> page = scriptService.getPage(reqVO);
        Map<Long, AdminUserRespDTO> users = adminUserApi.getUserMap(convertSet(page.getList(), AiScriptTemplateDO::getCreatedBy));
        List<AiScriptRespVO> records = page.getList().stream().map(row -> toResp(row, users.get(row.getCreatedBy()), false)).toList();
        return success(new PageResult<>(records, page.getTotal()));
    }

    @GetMapping("/get")
    @Operation(summary = "查询话术版本详情")
    @PreAuthorize("@ss.hasPermission('callphone:ai:script:list')")
    public CommonResult<AiScriptRespVO> get(@RequestParam("id") Long id) {
        AiScriptTemplateDO row = scriptService.get(id);
        if (row == null) return success(null);
        AdminUserRespDTO creator = row.getCreatedBy() == null ? null : adminUserApi.getUser(row.getCreatedBy());
        return success(toResp(row, creator, true));
    }

    @PostMapping("/save-draft")
    @Operation(summary = "创建或保存话术草稿")
    @PreAuthorize("@ss.hasPermission('callphone:ai:script:edit')")
    public CommonResult<Long> saveDraft(@Valid @RequestBody AiScriptSaveDraftReqVO reqVO) {
        return success(scriptService.saveDraft(reqVO, getLoginUserId()).getId());
    }

    @PostMapping("/create-version")
    @Operation(summary = "从已发布版本创建新草稿")
    @PreAuthorize("@ss.hasPermission('callphone:ai:script:edit')")
    public CommonResult<Long> createVersion(@RequestParam("id") Long id) {
        return success(scriptService.createVersion(id, getLoginUserId()).getId());
    }

    @PostMapping("/publish")
    @Operation(summary = "发布话术草稿")
    @PreAuthorize("@ss.hasPermission('callphone:ai:script:publish')")
    public CommonResult<Boolean> publish(@RequestParam("id") Long id) {
        return success(scriptService.publish(id, getLoginUserId()));
    }

    @PostMapping("/record-usage")
    @Operation(summary = "记录话术预览或复制使用")
    @PreAuthorize("@ss.hasPermission('callphone:ai:script:use')")
    public CommonResult<Boolean> recordUsage(@RequestParam("id") Long id, @Valid AiScriptUsageReqVO reqVO) {
        return success(scriptService.recordUsage(id, reqVO.getAction()));
    }

    private AiScriptRespVO toResp(AiScriptTemplateDO row, AdminUserRespDTO creator, boolean includeContent) {
        AiScriptRespVO resp = new AiScriptRespVO();
        resp.setId(row.getId()); resp.setTemplateKey(row.getTemplateKey()); resp.setVersion(row.getVersionNo());
        resp.setName(row.getName()); resp.setStageCode(row.getStageCode()); resp.setChannel(row.getChannel());
        resp.setTags(parseArray(row.getTagsJson())); resp.setVariables(parseArray(row.getVariablesJson()));
        resp.setStatus(row.getStatus()); resp.setUsageCount(row.getUsageCount()); resp.setCopyCount(row.getCopyCount());
        resp.setCreatedBy(row.getCreatedBy()); resp.setCreatorName(creator == null ? null : creator.getNickname());
        resp.setPublishedAt(row.getPublishedAt()); resp.setLastUsedAt(row.getLastUsedAt()); resp.setCreateTime(row.getCreateTime());
        if (includeContent) resp.setContent(scriptService.decryptContent(row));
        return resp;
    }

    private List<String> parseArray(String json) {
        if (json == null || json.isBlank()) return List.of();
        try { return JSONUtil.parseArray(json).toList(String.class); }
        catch (Exception ignored) { return List.of(); }
    }
}

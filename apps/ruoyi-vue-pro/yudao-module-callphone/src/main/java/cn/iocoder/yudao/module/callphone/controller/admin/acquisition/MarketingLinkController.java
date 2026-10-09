package cn.iocoder.yudao.module.callphone.controller.admin.acquisition;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.MarketingLinkSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.MarketingLinkDO;
import cn.iocoder.yudao.module.callphone.service.acquisition.MarketingLinkService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 获客链接")
@RestController
@RequestMapping("/callphone/marketing-link")
@Validated
public class MarketingLinkController {

    @Resource private MarketingLinkService marketingLinkService;

    @GetMapping("/page")
    @Operation(summary = "获客链接分页")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:link:list')")
    public CommonResult<PageResult<MarketingLinkRespVO>> getPage(@Valid MarketingLinkPageReqVO reqVO) {
        PageResult<MarketingLinkDO> page = marketingLinkService.getPage(reqVO);
        List<MarketingLinkRespVO> rows = page.getList().stream()
                .map(row -> BeanUtils.toBean(row, MarketingLinkRespVO.class)).toList();
        Map<String, Long> leadCounts = marketingLinkService.getLeadCounts(
                page.getList().stream().map(MarketingLinkDO::getPublicCode).toList(), getLoginUserId());
        for (int i = 0; i < rows.size(); i++) {
            rows.get(i).setLeadCount(leadCounts.getOrDefault(page.getList().get(i).getPublicCode(), 0L));
        }
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @Operation(summary = "新建或编辑获客链接")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:link:manage')")
    public CommonResult<Long> save(@Valid @RequestBody MarketingLinkSaveReqVO reqVO) {
        return success(marketingLinkService.save(reqVO));
    }

    @PutMapping("/status")
    @Operation(summary = "启用或停用获客链接")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:link:manage')")
    public CommonResult<Boolean> setStatus(@RequestParam("id") Long id,
                                            @RequestParam("status") @Pattern(regexp = "^(active|disabled)$") String status) {
        return success(marketingLinkService.setStatus(id, status));
    }
}

package cn.iocoder.yudao.module.callphone.controller.admin.acquisition;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.collection.CollectionUtils;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodePageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodeRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.TrackingCodeSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.service.acquisition.TrackingCodeService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
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

@Tag(name = "管理后台 - Call Phone 活码")
@RestController
@RequestMapping("/callphone/tracking-code")
@Validated
public class TrackingCodeController {

    @Resource private TrackingCodeService trackingCodeService;
    @Resource private AdminUserApi adminUserApi;

    @GetMapping("/page")
    @Operation(summary = "按活码类型分页查询")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:code:list')")
    public CommonResult<PageResult<TrackingCodeRespVO>> getPage(@Valid TrackingCodePageReqVO reqVO) {
        PageResult<TrackingCodeDO> page = trackingCodeService.getPage(reqVO, getLoginUserId());
        Map<Long, AdminUserRespDTO> users = adminUserApi.getUserMap(CollectionUtils.convertSet(page.getList(), TrackingCodeDO::getEmployeeId));
        List<TrackingCodeRespVO> rows = page.getList().stream().map(row -> {
            TrackingCodeRespVO respVO = BeanUtils.toBean(row, TrackingCodeRespVO.class);
            respVO.setCreateTime(row.getCreateTime());
            AdminUserRespDTO user = users.get(row.getEmployeeId());
            if (user != null) respVO.setEmployeeName(user.getNickname());
            return respVO;
        }).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @Operation(summary = "新建或编辑活码配置")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:code:manage')")
    public CommonResult<Long> save(@Valid @RequestBody TrackingCodeSaveReqVO reqVO) {
        return success(trackingCodeService.save(reqVO));
    }

    @PutMapping("/status")
    @Operation(summary = "启用或停用活码配置")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:code:manage')")
    public CommonResult<Boolean> setStatus(@RequestParam("id") Long id,
                                            @RequestParam("status") @Pattern(regexp = "^(active|disabled)$") String status) {
        return success(trackingCodeService.setStatus(id, status));
    }
}

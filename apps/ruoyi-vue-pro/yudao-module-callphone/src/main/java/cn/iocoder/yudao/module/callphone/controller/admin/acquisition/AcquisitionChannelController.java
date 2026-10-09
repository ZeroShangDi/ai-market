package cn.iocoder.yudao.module.callphone.controller.admin.acquisition;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.collection.CollectionUtils;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.service.acquisition.AcquisitionChannelService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - Call Phone 获客渠道")
@RestController
@RequestMapping("/callphone/acquisition-channel")
@Validated
public class AcquisitionChannelController {

    @Resource private AcquisitionChannelService channelService;
    @Resource private AdminUserApi adminUserApi;

    @GetMapping("/page")
    @Operation(summary = "获客渠道分页")
    @PreAuthorize("@ss.hasAnyPermissions('callphone:acquisition:channel:list', 'callphone:acquisition:code:list', 'callphone:acquisition:link:list')")
    public CommonResult<PageResult<AcquisitionChannelRespVO>> getPage(@Valid AcquisitionChannelPageReqVO reqVO) {
        PageResult<AcquisitionChannelDO> page = channelService.getPage(reqVO);
        Map<Long, AdminUserRespDTO> users = adminUserApi.getUserMap(CollectionUtils.convertSet(page.getList(), AcquisitionChannelDO::getOwnerUserId));
        List<AcquisitionChannelRespVO> rows = page.getList().stream().map(row -> {
            AcquisitionChannelRespVO respVO = BeanUtils.toBean(row, AcquisitionChannelRespVO.class);
            respVO.setCreatedAt(row.getCreateTime());
            AdminUserRespDTO owner = users.get(row.getOwnerUserId());
            if (owner != null) respVO.setOwnerName(owner.getNickname());
            return respVO;
        }).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @Operation(summary = "新建或编辑获客渠道")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:channel:manage')")
    public CommonResult<Long> save(@Valid @RequestBody AcquisitionChannelSaveReqVO reqVO) {
        return success(channelService.save(reqVO));
    }

    @PutMapping("/status")
    @Operation(summary = "启用或停用获客渠道")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:channel:manage')")
    public CommonResult<Boolean> setStatus(@RequestParam("id") Long id, @RequestParam("status") String status) {
        return success(channelService.setStatus(id, status));
    }
}

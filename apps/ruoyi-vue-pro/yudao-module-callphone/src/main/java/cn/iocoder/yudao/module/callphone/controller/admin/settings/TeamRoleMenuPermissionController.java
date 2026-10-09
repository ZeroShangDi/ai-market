package cn.iocoder.yudao.module.callphone.controller.admin.settings;

import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.CallPhoneRoleMenuOptionsRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.CallPhoneRoleMenuPermissionSaveReqVO;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.settings.CallPhoneRoleMenuPolicy;
import cn.iocoder.yudao.module.system.controller.admin.permission.vo.menu.MenuListReqVO;
import cn.iocoder.yudao.module.system.controller.admin.permission.vo.menu.MenuRespVO;
import cn.iocoder.yudao.module.system.dal.dataobject.permission.MenuDO;
import cn.iocoder.yudao.module.system.service.permission.MenuService;
import cn.iocoder.yudao.module.system.service.permission.PermissionService;
import cn.iocoder.yudao.module.system.service.permission.RoleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - Call Phone 角色页面权限")
@RestController
@RequestMapping("/callphone/team-role")
@Validated
public class TeamRoleMenuPermissionController {

    @Resource
    private MenuService menuService;
    @Resource
    private PermissionService permissionService;
    @Resource
    private RoleService roleService;

    @GetMapping("/menu-options")
    @Operation(summary = "查询 Call Phone 可分配菜单及角色当前授权")
    @PreAuthorize("@ss.hasPermission('callphone:team:permissions:manage')")
    public CommonResult<CallPhoneRoleMenuOptionsRespVO> getMenuOptions(@RequestParam("roleId") Long roleId) {
        requireRole(roleId);
        List<MenuDO> availableMenus = getAvailableMenus();
        Set<Long> callPhoneMenuIds = CallPhoneRoleMenuPolicy.collectCallPhoneMenuIds(availableMenus);
        List<MenuRespVO> callPhoneMenus = availableMenus.stream()
                .filter(menu -> callPhoneMenuIds.contains(menu.getId()))
                .map(menu -> BeanUtils.toBean(menu, MenuRespVO.class))
                .toList();
        Set<Long> assignedMenuIds = permissionService.getRoleMenuListByRoleId(roleId).stream()
                .filter(callPhoneMenuIds::contains)
                .collect(Collectors.toSet());

        CallPhoneRoleMenuOptionsRespVO respVO = new CallPhoneRoleMenuOptionsRespVO();
        respVO.setMenus(callPhoneMenus);
        respVO.setAssignedMenuIds(assignedMenuIds);
        return success(respVO);
    }

    @PostMapping("/menu-permissions")
    @Operation(summary = "保存 Call Phone 菜单权限并保留角色的其他菜单授权")
    @PreAuthorize("@ss.hasPermission('callphone:team:permissions:manage')")
    public CommonResult<Boolean> saveMenuPermissions(
            @RequestBody @Valid CallPhoneRoleMenuPermissionSaveReqVO reqVO) {
        requireRole(reqVO.getRoleId());
        Set<Long> callPhoneMenuIds = CallPhoneRoleMenuPolicy.collectCallPhoneMenuIds(getAvailableMenus());
        Set<Long> selectedMenuIds = reqVO.getMenuIds();
        CallPhoneRoleMenuPolicy.validateSelection(selectedMenuIds, callPhoneMenuIds);

        Set<Long> currentlyAssigned = permissionService.getRoleMenuListByRoleId(reqVO.getRoleId());
        Set<Long> mergedMenuIds = CallPhoneRoleMenuPolicy.mergeRoleMenuIds(
                currentlyAssigned, selectedMenuIds, callPhoneMenuIds);
        permissionService.assignRoleMenu(reqVO.getRoleId(), mergedMenuIds);
        return success(true);
    }

    private void requireRole(Long roleId) {
        if (roleService.getRole(roleId) == null) {
            throw new ServiceException(ErrorCodeConstants.CALLPHONE_ROLE_NOT_FOUND);
        }
    }

    private List<MenuDO> getAvailableMenus() {
        MenuListReqVO reqVO = new MenuListReqVO();
        reqVO.setStatus(CommonStatusEnum.ENABLE.getStatus());
        return menuService.filterDisableMenus(menuService.getMenuListByTenant(reqVO));
    }

}

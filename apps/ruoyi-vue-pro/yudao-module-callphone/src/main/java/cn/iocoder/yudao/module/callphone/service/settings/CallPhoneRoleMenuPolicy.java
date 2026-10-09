package cn.iocoder.yudao.module.callphone.service.settings;

import cn.iocoder.yudao.module.system.dal.dataobject.permission.MenuDO;

import java.util.*;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALLPHONE_ROLE_MENU_SCOPE_INVALID;

/**
 * Bounds team-role menu edits to the Call Phone menu subtree while preserving all other grants.
 */
public final class CallPhoneRoleMenuPolicy {

    private CallPhoneRoleMenuPolicy() {
    }

    public static Set<Long> collectCallPhoneMenuIds(List<MenuDO> menus) {
        Map<Long, MenuDO> menuById = menus.stream().collect(Collectors.toMap(MenuDO::getId, menu -> menu));
        Set<Long> result = new HashSet<>();
        for (MenuDO menu : menus) {
            if (!isCallPhoneMenu(menu)) {
                continue;
            }
            MenuDO current = menu;
            while (current != null && result.add(current.getId())) {
                current = menuById.get(current.getParentId());
            }
        }
        return result;
    }

    public static void validateSelection(Set<Long> selectedMenuIds, Set<Long> callPhoneMenuIds) {
        if (selectedMenuIds == null || !callPhoneMenuIds.containsAll(selectedMenuIds)) {
            throw exception(CALLPHONE_ROLE_MENU_SCOPE_INVALID);
        }
    }

    public static Set<Long> mergeRoleMenuIds(Set<Long> currentMenuIds, Set<Long> selectedMenuIds,
                                             Set<Long> callPhoneMenuIds) {
        validateSelection(selectedMenuIds, callPhoneMenuIds);
        Set<Long> result = new HashSet<>(currentMenuIds == null ? Set.of() : currentMenuIds);
        result.removeAll(callPhoneMenuIds);
        result.addAll(selectedMenuIds);
        return result;
    }

    private static boolean isCallPhoneMenu(MenuDO menu) {
        String permission = menu.getPermission();
        String component = menu.getComponent();
        return "callphone".equals(permission)
                || (permission != null && permission.startsWith("callphone:"))
                || (component != null && component.startsWith("callphone/"))
                || "/callphone".equals(menu.getPath());
    }

}

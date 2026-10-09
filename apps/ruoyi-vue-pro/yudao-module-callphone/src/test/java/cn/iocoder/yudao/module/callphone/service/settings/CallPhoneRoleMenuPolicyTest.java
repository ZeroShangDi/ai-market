package cn.iocoder.yudao.module.callphone.service.settings;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.system.dal.dataobject.permission.MenuDO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CALLPHONE_ROLE_MENU_SCOPE_INVALID;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CallPhoneRoleMenuPolicyTest {

    @Test
    void includesCallPhonePagesAndTheirAncestorsOnly() {
        MenuDO root = menu(1L, 0L, "callphone", null, "/callphone");
        MenuDO settings = menu(2L, 1L, "", null, "settings");
        MenuDO teamRoles = menu(3L, 2L, "", "callphone/system/teams-roles/index", "teams-roles");
        MenuDO permission = menu(4L, 3L, "callphone:team:permissions:manage", "", "");
        MenuDO other = menu(5L, 0L, "system:role:update", "system/role/index", "role");

        assertEquals(Set.of(1L, 2L, 3L, 4L),
                CallPhoneRoleMenuPolicy.collectCallPhoneMenuIds(List.of(root, settings, teamRoles, permission, other)));
    }

    @Test
    void preservesUnrelatedRoleGrantsWhenMergingCallPhoneSelection() {
        Set<Long> result = CallPhoneRoleMenuPolicy.mergeRoleMenuIds(
                Set.of(1L, 2L, 3L, 9L, 10L), Set.of(1L, 2L, 4L), Set.of(1L, 2L, 3L, 4L));

        assertEquals(Set.of(1L, 2L, 4L, 9L, 10L), result);
    }

    @Test
    void rejectsSelectionsFromOtherModules() {
        ServiceException error = assertThrows(ServiceException.class,
                () -> CallPhoneRoleMenuPolicy.validateSelection(Set.of(1L, 99L), Set.of(1L, 2L)));

        assertEquals(CALLPHONE_ROLE_MENU_SCOPE_INVALID.getCode(), error.getCode());
    }

    private MenuDO menu(Long id, Long parentId, String permission, String component, String path) {
        MenuDO menu = new MenuDO();
        menu.setId(id);
        menu.setParentId(parentId);
        menu.setPermission(permission);
        menu.setComponent(component);
        menu.setPath(path);
        return menu;
    }

}

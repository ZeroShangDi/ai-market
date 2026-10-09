package cn.iocoder.yudao.module.callphone.framework.datapermission;

import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.framework.common.biz.system.permission.dto.DeptDataPermissionRespDTO;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallPhoneOwnerScopeServiceTest {

    private PermissionCommonApi permissionCommonApi;
    private AdminUserApi adminUserApi;
    private CallPhoneOwnerScopeService service;

    @BeforeEach
    void setUp() {
        permissionCommonApi = mock(PermissionCommonApi.class);
        adminUserApi = mock(AdminUserApi.class);
        service = new CallPhoneOwnerScopeService();
        ReflectionTestUtils.setField(service, "permissionCommonApi", permissionCommonApi);
        ReflectionTestUtils.setField(service, "adminUserApi", adminUserApi);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void shouldResolveSelfAndDepartmentMembersAndCacheForCurrentLogin() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        DeptDataPermissionRespDTO permission = new DeptDataPermissionRespDTO();
        permission.setSelf(true);
        permission.setDeptIds(Set.of(5L, 6L));
        when(permissionCommonApi.getDeptDataPermission(12L)).thenReturn(permission);
        when(adminUserApi.getUserListByDeptIds(Set.of(5L, 6L)))
                .thenReturn(List.of(user(34L), user(56L)));

        assertEquals(new CallPhoneOwnerScope(false, Set.of(12L, 34L, 56L)), service.getCurrentUserScope());
        assertEquals(new CallPhoneOwnerScope(false, Set.of(12L, 34L, 56L)), service.getCurrentUserScope());
        verify(permissionCommonApi).getDeptDataPermission(12L);
    }

    @Test
    void shouldReturnAllScopeWithoutLoadingDepartmentUsers() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        DeptDataPermissionRespDTO permission = new DeptDataPermissionRespDTO();
        permission.setAll(true);
        when(permissionCommonApi.getDeptDataPermission(12L)).thenReturn(permission);

        assertEquals(new CallPhoneOwnerScope(true, Set.of()), service.getCurrentUserScope());
        verify(adminUserApi, never()).getUserListByDeptIds(org.mockito.ArgumentMatchers.anyCollection());
    }

    @Test
    void shouldRejectMissingPermissionDataInsteadOfFailingOpen() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        when(permissionCommonApi.getDeptDataPermission(12L)).thenReturn(null);

        assertThrows(IllegalStateException.class, service::getCurrentUserScope);
    }

    @Test
    void shouldNotQueryAdminPermissionApiForNonAdminUsers() {
        setLoginUser(12L, UserTypeEnum.MEMBER.getValue());

        assertEquals(new CallPhoneOwnerScope(false, Set.of()), service.getCurrentUserScope());
        verify(permissionCommonApi, never()).getDeptDataPermission(12L);
    }

    private AdminUserRespDTO user(Long id) {
        AdminUserRespDTO user = new AdminUserRespDTO();
        user.setId(id);
        return user;
    }

    private void setLoginUser(Long id, Integer userType) {
        LoginUser loginUser = new LoginUser();
        loginUser.setId(id);
        loginUser.setUserType(userType);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null));
    }
}

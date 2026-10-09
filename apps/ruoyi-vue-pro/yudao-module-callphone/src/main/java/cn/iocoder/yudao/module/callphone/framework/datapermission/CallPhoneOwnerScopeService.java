package cn.iocoder.yudao.module.callphone.framework.datapermission;

import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.framework.common.biz.system.permission.dto.DeptDataPermissionRespDTO;
import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

/** Resolves Yudao's existing role data scope into the owner IDs used by Call Phone tables. */
@Component
public class CallPhoneOwnerScopeService {

    private static final String CONTEXT_KEY = CallPhoneOwnerScopeService.class.getSimpleName();

    @Resource
    private PermissionCommonApi permissionCommonApi;
    @Resource
    private AdminUserApi adminUserApi;

    public CallPhoneOwnerScope getCurrentUserScope() {
        LoginUser loginUser = SecurityFrameworkUtils.getLoginUser();
        if (loginUser == null || !UserTypeEnum.ADMIN.getValue().equals(loginUser.getUserType())) {
            return new CallPhoneOwnerScope(false, Set.of());
        }
        CallPhoneOwnerScope cached = loginUser.getContext(CONTEXT_KEY, CallPhoneOwnerScope.class);
        if (cached != null) {
            return cached;
        }

        DeptDataPermissionRespDTO permission = permissionCommonApi.getDeptDataPermission(loginUser.getId());
        if (permission == null) {
            throw new IllegalStateException("Yudao did not return data scope for the current user");
        }
        if (Boolean.TRUE.equals(permission.getAll())) {
            CallPhoneOwnerScope scope = new CallPhoneOwnerScope(true, Set.of());
            loginUser.setContext(CONTEXT_KEY, scope);
            return scope;
        }

        Set<Long> ownerUserIds = new HashSet<>();
        if (Boolean.TRUE.equals(permission.getSelf())) {
            ownerUserIds.add(loginUser.getId());
        }
        if (permission.getDeptIds() != null && !permission.getDeptIds().isEmpty()) {
            adminUserApi.getUserListByDeptIds(permission.getDeptIds()).stream()
                    .map(user -> user.getId())
                    .forEach(ownerUserIds::add);
        }
        CallPhoneOwnerScope scope = new CallPhoneOwnerScope(false, ownerUserIds);
        loginUser.setContext(CONTEXT_KEY, scope);
        return scope;
    }
}

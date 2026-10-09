package cn.iocoder.yudao.module.callphone.framework.datapermission;

import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import net.sf.jsqlparser.expression.Expression;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CallPhoneOwnerDataPermissionRuleTest {

    private CallPhoneOwnerScopeService ownerScopeService;
    private CallPhoneOwnerDataPermissionRule rule;

    @BeforeEach
    void setUp() {
        ownerScopeService = mock(CallPhoneOwnerScopeService.class);
        rule = new CallPhoneOwnerDataPermissionRule();
        ReflectionTestUtils.setField(rule, "ownerScopeService", ownerScopeService);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void shouldNotApplyAdminOwnerScopeToAnonymousOrNonAdminUsers() {
        assertNull(rule.getExpression("cp_customer", null));
        setLoginUser(12L, UserTypeEnum.MEMBER.getValue());

        assertNull(rule.getExpression("cp_customer", null));
        verifyNoInteractions(ownerScopeService);
    }

    @Test
    void shouldLeaveAllRowsVisibleForAllScope() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        when(ownerScopeService.getCurrentUserScope()).thenReturn(new CallPhoneOwnerScope(true, Set.of()));

        assertNull(rule.getExpression("cp_customer", null));
    }

    @Test
    void shouldRestrictOwnedRowsToResolvedUserIds() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        when(ownerScopeService.getCurrentUserScope())
                .thenReturn(new CallPhoneOwnerScope(false, Set.of(12L, 34L)));

        Expression expression = rule.getExpression("cp_call_record", null);

        assertEquals(Set.of("12", "34"), ownerIdsIn(expression.toString()));
    }

    @Test
    void shouldKeepUnassignedLeadsVisibleAlongsideScopedLeads() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        when(ownerScopeService.getCurrentUserScope())
                .thenReturn(new CallPhoneOwnerScope(false, Set.of(12L, 34L)));

        Expression expression = rule.getExpression("cp_lead", null);

        assertEquals(Set.of("12", "34"), ownerIdsIn(expression.toString()));
        org.junit.jupiter.api.Assertions.assertTrue(expression.toString().contains("OR cp_lead.owner_user_id IS NULL"));
    }

    @Test
    void shouldReturnNoOwnedRowsButKeepPublicLeadPoolForEmptyScope() {
        setLoginUser(12L, UserTypeEnum.ADMIN.getValue());
        when(ownerScopeService.getCurrentUserScope()).thenReturn(new CallPhoneOwnerScope(false, Set.of()));

        assertEquals("1 = 0", rule.getExpression("cp_customer", null).toString());
        assertEquals("(1 = 0 OR cp_lead.owner_user_id IS NULL)", rule.getExpression("cp_lead", null).toString());
    }

    private void setLoginUser(Long id, Integer userType) {
        LoginUser loginUser = new LoginUser();
        loginUser.setId(id);
        loginUser.setUserType(userType);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null));
    }

    private Set<String> ownerIdsIn(String expression) {
        Matcher matcher = Pattern.compile("owner_user_id IN \\(([^)]*)\\)").matcher(expression);
        if (!matcher.find()) return Set.of();
        return new HashSet<>(Arrays.stream(matcher.group(1).split(","))
                .map(String::trim)
                .toList());
    }
}

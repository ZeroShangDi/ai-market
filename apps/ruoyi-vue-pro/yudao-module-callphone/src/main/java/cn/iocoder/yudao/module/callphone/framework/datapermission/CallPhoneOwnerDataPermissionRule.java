package cn.iocoder.yudao.module.callphone.framework.datapermission;

import cn.iocoder.yudao.framework.common.enums.UserTypeEnum;
import cn.iocoder.yudao.framework.datapermission.core.rule.DataPermissionRule;
import cn.iocoder.yudao.framework.mybatis.core.util.MyBatisUtils;
import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils;
import jakarta.annotation.Resource;
import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.expression.operators.relational.InExpression;
import net.sf.jsqlparser.expression.operators.relational.IsNullExpression;
import net.sf.jsqlparser.expression.operators.relational.ParenthesedExpressionList;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Set;

/** Applies Yudao role scopes to Call Phone customer, lead and call-owned business rows. */
@Component
public class CallPhoneOwnerDataPermissionRule implements DataPermissionRule {

    private static final Map<String, String> OWNER_COLUMNS = Map.ofEntries(
            Map.entry("cp_customer", "owner_user_id"),
            Map.entry("cp_follow_up_task", "owner_user_id"),
            Map.entry("cp_lead", "owner_user_id"),
            Map.entry("cp_lead_activity", "owner_user_id"),
            Map.entry("cp_call_record", "owner_user_id"),
            Map.entry("cp_call_summary", "owner_user_id"),
            Map.entry("cp_service_review", "owner_user_id"),
            Map.entry("cp_risk_alert", "owner_user_id"),
            Map.entry("cp_ai_recommendation", "owner_user_id"),
            Map.entry("cp_ai_review_suggestion", "owner_user_id"));

    @Resource
    private CallPhoneOwnerScopeService ownerScopeService;

    @Override
    public Set<String> getTableNames() {
        return OWNER_COLUMNS.keySet();
    }

    @Override
    public Expression getExpression(String tableName, Alias tableAlias) {
        LoginUser loginUser = SecurityFrameworkUtils.getLoginUser();
        if (loginUser == null || !UserTypeEnum.ADMIN.getValue().equals(loginUser.getUserType())) {
            return null;
        }
        CallPhoneOwnerScope scope = ownerScopeService.getCurrentUserScope();
        if (scope.all()) {
            return null;
        }

        Expression ownerColumn = MyBatisUtils.buildColumn(tableName, tableAlias, OWNER_COLUMNS.get(tableName));
        Expression ownerExpression = scope.ownerUserIds().isEmpty()
                ? new EqualsTo(new LongValue(1), new LongValue(0))
                : new InExpression(ownerColumn, new ParenthesedExpressionList(
                        new ExpressionList<LongValue>(scope.ownerUserIds().stream().map(LongValue::new).toList())));
        // Unassigned leads are a shared claim pool and remain visible to users who can list leads.
        if ("cp_lead".equals(tableName)) {
            IsNullExpression unassignedLead = new IsNullExpression();
            unassignedLead.setLeftExpression(ownerColumn);
            return new ParenthesedExpressionList(new OrExpression(ownerExpression, unassignedLead));
        }
        return ownerExpression;
    }
}

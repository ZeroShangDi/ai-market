package cn.iocoder.yudao.module.callphone.dal.mysql.leads;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadAssignmentRuleMemberDO;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LeadAssignmentRuleMemberMapper extends BaseMapperX<LeadAssignmentRuleMemberDO> {

    @Delete("DELETE FROM cp_lead_assignment_rule_member WHERE tenant_id = #{tenantId} AND rule_id = #{ruleId}")
    int deleteByRuleId(@Param("tenantId") Long tenantId, @Param("ruleId") Long ruleId);

    List<LeadAssignmentRuleMemberDO> selectByRuleIds(@Param("tenantId") Long tenantId,
                                                     @Param("ruleIds") List<Long> ruleIds);
}

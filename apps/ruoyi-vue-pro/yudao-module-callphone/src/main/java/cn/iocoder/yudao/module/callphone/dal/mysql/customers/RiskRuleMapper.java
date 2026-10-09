package cn.iocoder.yudao.module.callphone.dal.mysql.customers;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.customers.RiskRuleDO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RiskRuleMapper extends BaseMapperX<RiskRuleDO> {
    default List<RiskRuleDO> selectAll() {
        return selectList(new LambdaQueryWrapperX<RiskRuleDO>().orderByAsc(RiskRuleDO::getRuleCode));
    }
    default RiskRuleDO selectByCode(String ruleCode) {
        return selectOne(new LambdaQueryWrapperX<RiskRuleDO>().eq(RiskRuleDO::getRuleCode, ruleCode));
    }
}

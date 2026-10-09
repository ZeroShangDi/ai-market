package cn.iocoder.yudao.module.callphone.dal.mysql.leads;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadConversionPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadConversionDO;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.apache.ibatis.annotations.Mapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface LeadConversionMapper extends BaseMapperX<LeadConversionDO> {
    default PageResult<LeadConversionDO> selectPage(LeadConversionPageReqVO reqVO, Long convertedBy) {
        return selectPage(reqVO, new LambdaQueryWrapperX<LeadConversionDO>()
                .eq(LeadConversionDO::getConvertedBy, convertedBy)
                .likeIfPresent(LeadConversionDO::getPhoneDisplay, reqVO.getQuery())
                .orderByDesc(LeadConversionDO::getConvertedAt).orderByDesc(LeadConversionDO::getId));
    }

    default List<Map<String, Object>> selectAcquisitionStatsWithinWindow(List<String> sourceCodes, Long convertedBy,
                                                                          LocalDateTime fromInclusive,
                                                                          LocalDateTime toExclusive,
                                                                          Integer attributionWindowDays) {
        if (sourceCodes.isEmpty()) return List.of();
        QueryWrapper<LeadConversionDO> query = new QueryWrapper<LeadConversionDO>()
                .select("source_code AS sourceCode", "COUNT(*) AS conversionCount")
                .eq("converted_by", convertedBy)
                .in("source_code", sourceCodes)
                .ge("converted_at", fromInclusive)
                .lt("converted_at", toExclusive)
                .apply("EXISTS (SELECT 1 FROM cp_lead l WHERE l.id = cp_lead_conversion.lead_id "
                                + "AND l.tenant_id = cp_lead_conversion.tenant_id "
                                + "AND l.source_code = cp_lead_conversion.source_code AND l.deleted = b'0' "
                                + "AND cp_lead_conversion.converted_at >= l.create_time "
                                + "AND cp_lead_conversion.converted_at <= DATE_ADD(l.create_time, INTERVAL {0} DAY))",
                        attributionWindowDays)
                .groupBy("source_code");
        return selectMaps(query);
    }
}

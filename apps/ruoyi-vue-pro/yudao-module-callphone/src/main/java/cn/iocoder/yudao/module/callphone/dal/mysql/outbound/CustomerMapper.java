package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerPageReqVO;
import cn.iocoder.yudao.module.callphone.util.CallPhoneTimeUtils;
import java.time.LocalDate;
import java.time.ZoneId;
import org.apache.ibatis.annotations.Mapper;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Mapper
public interface CustomerMapper extends BaseMapperX<CustomerDO> {
    default PageResult<CustomerDO> selectPage(CustomerPageReqVO reqVO) {
        return selectPage(reqVO, new LambdaQueryWrapperX<CustomerDO>()
                .eq(CustomerDO::getStatus, "active")
                .eqIfPresent(CustomerDO::getStage, reqVO.getStage())
                .likeIfPresent(CustomerDO::getPhoneDisplay, reqVO.getQuery())
                .orderByDesc(CustomerDO::getUpdateTime)
                .orderByDesc(CustomerDO::getId));
    }

    default PageResult<CustomerDO> selectMobilePage(CustomerPageReqVO reqVO, Long tenantId, Long ownerUserId, String scope) {
        LambdaQueryWrapperX<CustomerDO> query = new LambdaQueryWrapperX<CustomerDO>()
                .eq(CustomerDO::getOwnerUserId, ownerUserId)
                .eq(CustomerDO::getStatus, "active")
                .likeIfPresent(CustomerDO::getPhoneDisplay, reqVO.getQuery())
                .orderByDesc(CustomerDO::getUpdateTime).orderByDesc(CustomerDO::getId);
        if ("today".equals(scope) || "recent".equals(scope)) {
            boolean today = "today".equals(scope);
            LocalDate businessDate = LocalDate.now(ZoneId.of("Asia/Shanghai"));
            LocalDateTime start = today
                    ? CallPhoneTimeUtils.businessDayStartUtc(businessDate)
                    : LocalDateTime.now(ZoneOffset.UTC).minusDays(30);
            String escapedStart = start.toString().replace('T', ' ');
            // Tenant and owner IDs come from authenticated server context; timestamps are server generated.
            query.inSql(CustomerDO::getId, "SELECT DISTINCT customer_id FROM cp_call_record WHERE customer_id IS NOT NULL"
                    + " AND tenant_id = " + tenantId + " AND deleted = b'0'"
                    + " AND owner_user_id = " + ownerUserId + " AND started_at >= '" + escapedStart + "'"
                    + (today ? " AND started_at < '" + CallPhoneTimeUtils.businessDayStartUtc(
                            businessDate.plusDays(1)).toString().replace('T', ' ') + "'" : ""));
        } else if (!"all".equals(scope)) {
            throw new IllegalArgumentException("Unsupported mobile customer scope");
        }
        return selectPage(reqVO, query);
    }

    default List<CustomerDO> selectStaleForRiskScan(Long ownerUserId, LocalDateTime cutoff) {
        return selectList(new LambdaQueryWrapperX<CustomerDO>()
                .eq(CustomerDO::getOwnerUserId, ownerUserId)
                .eq(CustomerDO::getStatus, "active")
                .lt(CustomerDO::getUpdateTime, cutoff)
                .orderByAsc(CustomerDO::getUpdateTime)
                .last("LIMIT 2000"));
    }

    default CustomerDO selectByImportKey(Long ownerUserId, String importKey) {
        return selectOne(new LambdaQueryWrapperX<CustomerDO>()
                .eq(CustomerDO::getOwnerUserId, ownerUserId)
                .eq(CustomerDO::getImportKey, importKey));
    }
}

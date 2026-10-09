package cn.iocoder.yudao.module.callphone.dal.mysql.leads;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadAssignmentPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface LeadMapper extends BaseMapperX<LeadDO> {
    default PageResult<LeadDO> selectAssignmentPage(LeadAssignmentPageReqVO reqVO) {
        LambdaQueryWrapperX<LeadDO> query = new LambdaQueryWrapperX<>();
        query.in(LeadDO::getStatus, "new", "claimed");
        query.eqIfPresent(LeadDO::getStatus, reqVO.getStatus())
                .eqIfPresent(LeadDO::getOwnerUserId, reqVO.getOwnerUserId())
                .likeIfPresent(LeadDO::getPhoneDisplay, reqVO.getQuery());
        query.orderByDesc(LeadDO::getUpdateTime);
        return selectPage(reqVO, query);
    }

    default PageResult<LeadDO> selectVisiblePage(LeadPageReqVO reqVO) {
        LambdaQueryWrapperX<LeadDO> query = new LambdaQueryWrapperX<>();
        // The shared unassigned pool is visible to everyone with this permission;
        // claimed leads are narrowed by Yudao's owner data permission rule.
        query.in(LeadDO::getStatus, "new", "claimed");
        query.eqIfPresent(LeadDO::getSourceCode, reqVO.getSourceCode())
                .likeIfPresent(LeadDO::getPhoneDisplay, reqVO.getQuery());
        query.orderByDesc(LeadDO::getScore).orderByDesc(LeadDO::getCreateTime);
        return selectPage(reqVO, query);
    }

    default List<Map<String, Object>> selectAcquisitionStats(List<String> sourceCodes, Long ownerUserId,
                                                              LocalDateTime fromInclusive, LocalDateTime toExclusive) {
        if (sourceCodes.isEmpty()) return List.of();
        QueryWrapper<LeadDO> query = new QueryWrapper<LeadDO>()
                .select("source_code AS sourceCode", "COUNT(*) AS leadCount",
                        "SUM(CASE WHEN status <> 'archived' THEN 1 ELSE 0 END) AS validLeadCount")
                .eq("owner_user_id", ownerUserId)
                .in("source_code", sourceCodes)
                .ge("create_time", fromInclusive)
                .lt("create_time", toExclusive)
                .groupBy("source_code");
        return selectMaps(query);
    }

    default List<Map<String, Object>> selectAttributionCounts(List<String> sourceCodes, Long ownerUserId) {
        if (sourceCodes.isEmpty() || ownerUserId == null) return List.of();
        QueryWrapper<LeadDO> query = new QueryWrapper<LeadDO>()
                .select("source_code AS sourceCode", "COUNT(*) AS leadCount")
                .eq("owner_user_id", ownerUserId)
                .in("source_code", sourceCodes)
                .groupBy("source_code");
        return selectMaps(query);
    }

    default List<LeadDO> selectExpiredClaimed(LocalDateTime cutoff, int limit) {
        if (cutoff == null || limit < 1 || limit > 500) return List.of();
        return selectList(new LambdaQueryWrapperX<LeadDO>()
                .eq(LeadDO::getStatus, "claimed")
                .isNotNull(LeadDO::getOwnerUserId)
                .le(LeadDO::getUpdateTime, cutoff)
                .orderByAsc(LeadDO::getUpdateTime)
                .orderByAsc(LeadDO::getId)
                .last("LIMIT " + limit));
    }

    @Update("""
            UPDATE cp_lead
            SET owner_user_id = NULL, status = 'new', updater = '0', update_time = #{now}
            WHERE id = #{leadId} AND tenant_id = #{tenantId}
              AND deleted = b'0'
              AND owner_user_id = #{ownerUserId} AND status = 'claimed'
              AND update_time = #{expectedUpdateTime} AND update_time <= #{cutoff}
              AND NOT EXISTS (
                  SELECT 1 FROM cp_lead_activity a
                  WHERE a.tenant_id = cp_lead.tenant_id AND a.lead_id = cp_lead.id
                    AND a.deleted = b'0' AND a.create_time > #{cutoff}
              )
              AND NOT EXISTS (
                  SELECT 1 FROM cp_call_dispatch d
                  WHERE d.tenant_id = cp_lead.tenant_id AND d.lead_id = cp_lead.id
                    AND d.deleted = b'0' AND d.status IN ('queued', 'accepted')
              )
            """)
    int recycleExpiredClaimed(@Param("tenantId") Long tenantId, @Param("leadId") Long leadId,
                              @Param("ownerUserId") Long ownerUserId,
                              @Param("expectedUpdateTime") LocalDateTime expectedUpdateTime,
                              @Param("cutoff") LocalDateTime cutoff, @Param("now") LocalDateTime now);
}

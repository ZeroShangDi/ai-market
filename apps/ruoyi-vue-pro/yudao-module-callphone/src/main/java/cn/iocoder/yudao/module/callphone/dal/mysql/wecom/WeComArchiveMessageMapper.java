package cn.iocoder.yudao.module.callphone.dal.mysql.wecom;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo.WeComArchivePageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.wecom.WeComArchiveMessageDO;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface WeComArchiveMessageMapper extends BaseMapperX<WeComArchiveMessageDO> {
    default PageResult<WeComArchiveMessageDO> selectPage(WeComArchivePageReqVO req, LocalDateTime retentionCutoff) {
        LambdaQueryWrapperX<WeComArchiveMessageDO> query = new LambdaQueryWrapperX<>();
        query.geIfPresent(WeComArchiveMessageDO::getMessageTime, req.getFromTime());
        query.leIfPresent(WeComArchiveMessageDO::getMessageTime, req.getToTime());
        query.eqIfPresent(WeComArchiveMessageDO::getConversationType, req.getConversationType());
        query.eqIfPresent(WeComArchiveMessageDO::getMessageType, req.getMessageType());
        query.gt(WeComArchiveMessageDO::getExpiresAt, LocalDateTime.now());
        query.gt(WeComArchiveMessageDO::getMessageTime, retentionCutoff);
        query.orderByDesc(WeComArchiveMessageDO::getMessageTime);
        return selectPage(req, query);
    }

    @Select("SELECT * FROM cp_wecom_archive_message WHERE tenant_id = #{tenantId} "
            + "AND (message_time <= #{cutoff} OR expires_at <= #{now}) "
            + "ORDER BY message_time ASC, id ASC LIMIT #{limit} FOR UPDATE")
    List<WeComArchiveMessageDO> selectExpiredForCleanup(@Param("tenantId") Long tenantId,
                                                         @Param("cutoff") LocalDateTime cutoff,
                                                         @Param("now") LocalDateTime now,
                                                         @Param("limit") int limit);

    @Delete("<script>DELETE FROM cp_wecom_archive_message WHERE tenant_id = #{tenantId} AND id IN "
            + "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach></script>")
    int hardDeleteExpiredMessages(@Param("tenantId") Long tenantId, @Param("ids") List<Long> ids);

    @Select("SELECT COUNT(*) FROM cp_wecom_archive_message WHERE tenant_id = #{tenantId} "
            + "AND (message_time <= #{cutoff} OR expires_at <= #{now})")
    Long countExpiredForCleanup(@Param("tenantId") Long tenantId,
                                @Param("cutoff") LocalDateTime cutoff,
                                @Param("now") LocalDateTime now);
}

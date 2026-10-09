package cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@Data
@EqualsAndHashCode(callSuper = true)
public class CallRecordPageReqVO extends PageParam {

    private String direction;
    private String resultCode;
    private Long ownerUserId;
    private String recordingState;
    private String query;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private OffsetDateTime from;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
    private OffsetDateTime to;

    public LocalDateTime getFromUtc() {
        return from == null ? null : from.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    public LocalDateTime getToUtc() {
        return to == null ? null : to.withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

}

package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class WeComArchivePageReqVO extends PageParam {
    private LocalDateTime fromTime;
    private LocalDateTime toTime;
    @Pattern(regexp = "|single|group") private String conversationType;
    @Pattern(regexp = "|text|image|voice|video|file|mixed|other") private String messageType;
}

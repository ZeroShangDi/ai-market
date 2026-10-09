package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class WeComArchiveRetentionSaveReqVO {
    @NotNull @Min(30) @Max(3650) private Integer retentionDays;
    @NotNull @Min(0) private Integer expectedVersion;
}

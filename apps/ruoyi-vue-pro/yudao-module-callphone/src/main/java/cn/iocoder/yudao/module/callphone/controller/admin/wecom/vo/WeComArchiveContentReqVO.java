package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class WeComArchiveContentReqVO {
    @NotNull private Long id;
    @Size(min = 8, max = 500) private String purpose;
}

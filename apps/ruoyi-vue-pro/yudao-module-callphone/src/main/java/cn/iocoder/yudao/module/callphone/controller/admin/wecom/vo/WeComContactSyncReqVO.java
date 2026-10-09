package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class WeComContactSyncReqVO {
    @NotBlank
    @Size(max = 128)
    private String followUserKey;
    @NotBlank
    @Size(min = 8, max = 64)
    private String idempotencyKey;
}

package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class FollowUpTaskSaveReqVO {
    private Long id;
    @NotNull private Long customerId;
    @NotBlank @Size(max = 120) private String title;
    @Size(max = 2000) private String content;
    @NotNull private LocalDateTime dueAt;
    private Long sourceCallRecordId;
}

package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class PosterCompositionPageReqVO extends PageParam {
    private String query;
    @Pattern(regexp = "^(active|disabled)$")
    private String status;
}

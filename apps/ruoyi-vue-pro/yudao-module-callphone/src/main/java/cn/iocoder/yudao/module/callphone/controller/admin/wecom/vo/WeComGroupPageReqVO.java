package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class WeComGroupPageReqVO extends PageParam {
    @Size(max = 80) private String query;
    @Size(max = 128) private String ownerKey;
    @Pattern(regexp = "|active|dissolved") private String status;
    private Boolean includePii = false;
}

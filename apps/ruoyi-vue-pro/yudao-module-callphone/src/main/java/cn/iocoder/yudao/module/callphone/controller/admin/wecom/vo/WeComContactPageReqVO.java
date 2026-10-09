package cn.iocoder.yudao.module.callphone.controller.admin.wecom.vo;

import cn.iocoder.yudao.framework.common.pojo.PageParam;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class WeComContactPageReqVO extends PageParam {
    @Size(max = 80)
    private String query;
    @Size(max = 128)
    private String followUserKey;
    @Pattern(regexp = "|external|internal", message = "外部联系人类型无效")
    private String externalType;
    private Boolean includePii = false;
}

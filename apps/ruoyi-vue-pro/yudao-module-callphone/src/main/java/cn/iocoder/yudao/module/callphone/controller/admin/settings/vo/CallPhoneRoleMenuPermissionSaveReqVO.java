package cn.iocoder.yudao.module.callphone.controller.admin.settings.vo;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.Collections;
import java.util.Set;

@Data
public class CallPhoneRoleMenuPermissionSaveReqVO {
    @NotNull(message = "角色编号不能为空")
    private Long roleId;
    private Set<Long> menuIds = Collections.emptySet();
}

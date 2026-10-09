package cn.iocoder.yudao.module.callphone.controller.admin.settings.vo;

import cn.iocoder.yudao.module.system.controller.admin.permission.vo.menu.MenuRespVO;
import lombok.Data;

import java.util.List;
import java.util.Set;

@Data
public class CallPhoneRoleMenuOptionsRespVO {
    private List<MenuRespVO> menus;
    private Set<Long> assignedMenuIds;
}

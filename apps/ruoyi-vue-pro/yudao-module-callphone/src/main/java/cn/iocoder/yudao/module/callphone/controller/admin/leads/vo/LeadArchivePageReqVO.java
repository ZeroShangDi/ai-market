package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;
import cn.iocoder.yudao.framework.common.pojo.PageParam;
import lombok.Data;
import lombok.EqualsAndHashCode;
@Data
@EqualsAndHashCode(callSuper = true)
public class LeadArchivePageReqVO extends PageParam { private String archiveType; }

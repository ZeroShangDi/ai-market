package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import java.util.List;
import lombok.Data;

@Data
public class RiskAlertPageRespVO {
    private List<RiskAlertRespVO> list;
    private Long total;
    private Long openCount;
    private Long highCount;
    private Long mediumCount;
    private Long lowCount;
    private Long resolvedCount;
}

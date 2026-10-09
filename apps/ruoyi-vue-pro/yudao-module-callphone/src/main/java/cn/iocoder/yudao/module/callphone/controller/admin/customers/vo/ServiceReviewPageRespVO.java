package cn.iocoder.yudao.module.callphone.controller.admin.customers.vo;

import java.util.List;
import lombok.Data;

@Data
public class ServiceReviewPageRespVO {

    private List<ServiceReviewRespVO> list;
    private Long total;
    private Long passCount;
    private Long improveCount;
    private Integer averageScore;
}

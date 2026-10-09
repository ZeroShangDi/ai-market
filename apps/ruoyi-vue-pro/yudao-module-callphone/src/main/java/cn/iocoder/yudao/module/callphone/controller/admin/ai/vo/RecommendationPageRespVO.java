package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.util.List;
import lombok.Data;

@Data
public class RecommendationPageRespVO {
    private List<RecommendationRespVO> list;
    private Long total;
    private Long pendingCount;
    private Long adoptedCount;
    private Long dismissedCount;
}

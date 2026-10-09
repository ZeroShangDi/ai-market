package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.util.List;
import lombok.Data;

@Data
public class AiReviewSuggestionPageRespVO {

    private List<AiReviewSuggestionRespVO> list;
    private Long total;
    private Long pendingCount;
    private Long highRiskPendingCount;
    private Long reviewedCount;
}

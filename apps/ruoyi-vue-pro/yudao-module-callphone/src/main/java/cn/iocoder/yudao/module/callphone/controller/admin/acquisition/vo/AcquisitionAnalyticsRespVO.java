package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class AcquisitionAnalyticsRespVO {
    private LocalDate fromDate;
    private LocalDate toDate;
    private String scope;
    private String leadMetricBasis;
    private String visitMetricState;
    private LocalDateTime updatedAt;
    private List<AcquisitionAnalyticsRowVO> channels;
}

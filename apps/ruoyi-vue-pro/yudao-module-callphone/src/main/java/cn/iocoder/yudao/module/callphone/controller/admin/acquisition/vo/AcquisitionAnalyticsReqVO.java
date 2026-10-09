package cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

@Data
public class AcquisitionAnalyticsReqVO {
    @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) private LocalDate fromDate;
    @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) private LocalDate toDate;

    @AssertTrue(message = "日期范围须合法且最多 366 天")
    public boolean isDateRangeValid() {
        return fromDate == null || toDate == null
                || (!fromDate.isAfter(toDate) && ChronoUnit.DAYS.between(fromDate, toDate) <= 365);
    }
}

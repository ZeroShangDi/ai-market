package cn.iocoder.yudao.module.callphone.service.outbound;

import java.time.LocalDate;
import java.time.LocalDateTime;
import cn.iocoder.yudao.module.callphone.util.CallPhoneTimeUtils;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CallRecordServiceImplTest {

    @Test
    void shanghaiBusinessDayBoundariesAreConvertedToUtcForDatabaseQueries() {
        LocalDate businessDate = LocalDate.of(2026, 10, 6);

        assertEquals(LocalDateTime.of(2026, 10, 5, 16, 0),
                CallPhoneTimeUtils.businessDayStartUtc(businessDate));
        assertEquals(LocalDateTime.of(2026, 10, 6, 16, 0),
                CallPhoneTimeUtils.businessDayStartUtc(businessDate.plusDays(1)));
    }
}

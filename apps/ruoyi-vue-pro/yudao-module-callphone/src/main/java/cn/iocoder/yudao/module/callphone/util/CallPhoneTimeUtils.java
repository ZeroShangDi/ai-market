package cn.iocoder.yudao.module.callphone.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Time helpers for business dates stored as UTC-naive database timestamps. */
public final class CallPhoneTimeUtils {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private CallPhoneTimeUtils() {
    }

    public static LocalDateTime businessDayStartUtc(LocalDate date) {
        return date.atStartOfDay(BUSINESS_ZONE).toInstant()
                .atOffset(ZoneOffset.UTC).toLocalDateTime();
    }
}

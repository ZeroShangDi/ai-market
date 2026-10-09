package cn.iocoder.yudao.module.callphone.util;

import java.time.OffsetDateTime;

/** Canonical, PII-safe fingerprints for replayable mobile call events. */
public final class MobileCallEventFingerprint {

    private MobileCallEventFingerprint() {
    }

    public static String completedCall(String deviceKey, String deviceEventId, Long callRecordId,
                                       String resultCode, OffsetDateTime startedAt, OffsetDateTime endedAt,
                                       Integer durationSeconds, String note) {
        return DeviceCredentialUtils.hmacSha256(deviceKey,
                "callphone-mobile-complete-v1", deviceEventId, String.valueOf(callRecordId), resultCode,
                startedAt == null ? null : startedAt.toInstant().toString(),
                endedAt == null ? null : endedAt.toInstant().toString(),
                durationSeconds == null ? null : String.valueOf(durationSeconds), note);
    }

    public static String completedCall(String deviceKey, String deviceEventId, Long callRecordId,
                                       String resultCode, OffsetDateTime startedAt, OffsetDateTime endedAt,
                                       Integer durationSeconds, String note, boolean recordingAvailable) {
        if (!recordingAvailable) {
            return completedCall(deviceKey, deviceEventId, callRecordId, resultCode, startedAt, endedAt,
                    durationSeconds, note);
        }
        return DeviceCredentialUtils.hmacSha256(deviceKey,
                "callphone-mobile-complete-v2", deviceEventId, String.valueOf(callRecordId), resultCode,
                startedAt == null ? null : startedAt.toInstant().toString(),
                endedAt == null ? null : endedAt.toInstant().toString(),
                durationSeconds == null ? null : String.valueOf(durationSeconds), note, "true");
    }
}

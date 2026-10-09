package cn.iocoder.yudao.module.callphone.util;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class MobileCallEventFingerprintTest {

    private static final String DEVICE_KEY = "Qm9XxgBg-SG6w3O58xD0j62D5e2rU8L1J0rqMZrYpm4";

    @Test
    void sameInstantAndPayloadHaveSameFingerprint() {
        String utc = fingerprint("connected", "说明\n第二行", "2026-10-06T01:02:03Z", "2026-10-06T01:03:04Z");
        String sameInstantsWithOtherOffsets = fingerprint("connected", "说明\n第二行",
                "2026-10-06T09:02:03+08:00", "2026-10-06T09:03:04+08:00");

        assertEquals(utc, sameInstantsWithOtherOffsets);
    }

    @Test
    void changedResultOrNoteHasDifferentFingerprint() {
        String baseline = fingerprint("connected", "已沟通", "2026-10-06T01:02:03Z", "2026-10-06T01:03:04Z");

        assertNotEquals(baseline, fingerprint("no_answer", "已沟通", "2026-10-06T01:02:03Z", "2026-10-06T01:03:04Z"));
        assertNotEquals(baseline, fingerprint("connected", "未沟通", "2026-10-06T01:02:03Z", "2026-10-06T01:03:04Z"));
        assertNotEquals(baseline, fingerprint("connected", "已沟通", "2026-10-06T01:02:03Z", "2026-10-06T01:03:05Z"));
        assertNotEquals(baseline, MobileCallEventFingerprint.completedCall(DEVICE_KEY, "event-1", 123L,
                "connected", OffsetDateTime.parse("2026-10-06T01:02:03Z"),
                OffsetDateTime.parse("2026-10-06T01:03:04Z"), 61, "已沟通", true));
    }

    private String fingerprint(String result, String note, String startedAt, String endedAt) {
        return MobileCallEventFingerprint.completedCall(DEVICE_KEY, "event-1", 123L, result,
                OffsetDateTime.parse(startedAt), OffsetDateTime.parse(endedAt), 61, note);
    }
}

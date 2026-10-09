package cn.iocoder.yudao.module.callphone.controller.app.outbound;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CallPhoneMobileDurationTest {
    @Test void missedCallRemainsZeroAfterLongRingingAndResultEntry() {
        assertEquals(0, CallPhoneMobileController.validateCallDuration(600, 0));
    }
    @Test void connectedDurationDoesNotIncludeRingingOrResultEntry() {
        assertEquals(30, CallPhoneMobileController.validateCallDuration(600, 30));
    }
    @Test void rejectsDurationLongerThanActualCallWindow() {
        assertThrows(ServiceException.class, () -> CallPhoneMobileController.validateCallDuration(30, 200));
        assertThrows(ServiceException.class, () -> CallPhoneMobileController.validateCallDuration(-1, 0));
        assertThrows(ServiceException.class, () -> CallPhoneMobileController.validateCallDuration(86401, 0));
    }
    @Test void permitsSmallDeviceRoundingDrift() {
        assertEquals(31, CallPhoneMobileController.validateCallDuration(30, 31));
    }
}

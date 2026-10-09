package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallDispatchDO;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CallDispatchIdempotencyTest {

    @Test
    void keepsDispatchSourceConsistentWithCustomerOrLeadTarget() {
        CallDispatchController.CallDispatchCreateReqVO request = request();

        assertTrue(CallDispatchController.isSourceCompatibleWithTarget(request));
        request.setSource("customer_list");
        assertTrue(CallDispatchController.isSourceCompatibleWithTarget(request));
        request.setSource("lead_followup");
        assertFalse(CallDispatchController.isSourceCompatibleWithTarget(request));

        request.setCustomerId(null);
        request.setLeadId(41L);
        assertTrue(CallDispatchController.isSourceCompatibleWithTarget(request));
        request.setSource("customer_detail");
        assertFalse(CallDispatchController.isSourceCompatibleWithTarget(request));
    }

    @Test
    void acceptsAnExactRetryOfTheSameDispatchRequest() {
        CallDispatchDO prior = prior();

        assertTrue(CallDispatchController.sameDispatchRequest(prior, request()));
    }

    @Test
    void rejectsReusingAKeyAfterAnyRequestFieldChanges() {
        CallDispatchDO prior = prior();

        CallDispatchController.CallDispatchCreateReqVO request = request();
        request.setCustomerId(22L);
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setLeadId(41L);
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setDeviceId(32L);
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setSource("lead_followup");
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setScriptCode("another-script");
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setFollowUpStatus("callback");
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setRequestNote("changed note");
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));

        request = request();
        request.setNextFollowUpAt(LocalDateTime.of(2026, 10, 7, 9, 30));
        assertFalse(CallDispatchController.sameDispatchRequest(prior, request));
    }

    private CallDispatchDO prior() {
        CallDispatchDO prior = new CallDispatchDO();
        prior.setCustomerId(21L);
        prior.setDeviceId(31L);
        prior.setSource("customer_detail");
        prior.setScriptCode("intro");
        prior.setFollowUpStatus("first_contact");
        prior.setRequestNote("Please call after 9");
        prior.setNextFollowUpAt(LocalDateTime.of(2026, 10, 7, 9, 0));
        return prior;
    }

    private CallDispatchController.CallDispatchCreateReqVO request() {
        CallDispatchController.CallDispatchCreateReqVO request = new CallDispatchController.CallDispatchCreateReqVO();
        request.setCustomerId(21L);
        request.setDeviceId(31L);
        request.setSource("customer_detail");
        request.setScriptCode("intro");
        request.setFollowUpStatus("first_contact");
        request.setRequestNote("Please call after 9");
        request.setNextFollowUpAt(LocalDateTime.of(2026, 10, 7, 9, 0));
        return request;
    }
}

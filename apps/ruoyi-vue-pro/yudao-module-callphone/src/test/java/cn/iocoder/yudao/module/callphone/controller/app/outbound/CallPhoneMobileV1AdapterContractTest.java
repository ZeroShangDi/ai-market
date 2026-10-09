package cn.iocoder.yudao.module.callphone.controller.app.outbound;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.AcceptDispatchRespVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.CompleteCallReqVO;
import cn.iocoder.yudao.module.callphone.controller.app.outbound.CallPhoneMobileController.DispatchActionReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.settings.vo.EntitlementSnapshotRespVO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
class CallPhoneMobileV1AdapterContractTest {

    private static final ObjectMapper MAPPER = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void pcDispatchAcceptUsesMobileV1SnakeCaseAndKeepsSnowflakeIdsAsStrings() throws Exception {
        String dispatchId = "9007199254740993";
        String callId = "9007199254740995";
        CallPhoneMobileController mobileController = mock(CallPhoneMobileController.class);
        AcceptDispatchRespVO accepted = new AcceptDispatchRespVO();
        accepted.setDispatchId(Long.valueOf(dispatchId));
        accepted.setCallRecordId(Long.valueOf(callId));
        accepted.setPhoneNumber("13800000000");
        accepted.setStatus("accepted");
        when(mobileController.accept(any(DispatchActionReqVO.class), eq("device-secret")))
                .thenReturn(CommonResult.success(accepted));

        CallPhoneMobileV1AdapterController adapter = new CallPhoneMobileV1AdapterController();
        ReflectionTestUtils.setField(adapter, "mobileController", mobileController);
        CallPhoneMobileV1AdapterController.BeginCallReqVO request = MAPPER.readValue("""
                {"source":"pc_dispatch","dispatch_id":"9007199254740993","device_event_id":"evt-1"}
                """, CallPhoneMobileV1AdapterController.BeginCallReqVO.class);

        var response = adapter.beginCall(request, "9007199254740997", "device-secret");
        JsonNode json = MAPPER.readTree(MAPPER.writeValueAsString(response.getData()));
        ArgumentCaptor<DispatchActionReqVO> acceptedRequest = ArgumentCaptor.forClass(DispatchActionReqVO.class);
        verify(mobileController).accept(acceptedRequest.capture(), eq("device-secret"));

        assertEquals(dispatchId, acceptedRequest.getValue().getDispatchId().toString());
        assertEquals("9007199254740997", acceptedRequest.getValue().getDeviceId().toString());
        assertEquals("evt-1", acceptedRequest.getValue().getDeviceEventId());
        assertEquals(callId, json.get("call_id").asText());
        assertEquals(dispatchId, json.get("dispatch_id").asText());
        assertTrue(json.get("call_id").isTextual());
        assertEquals("13800000000", json.get("phone_number").asText());
    }

    @Test
    void completionUsesPathCallIdAndMobileV1SnakeCaseFields() throws Exception {
        long callId = 9_007_199_254_740_993L;
        CallPhoneMobileController mobileController = mock(CallPhoneMobileController.class);
        when(mobileController.complete(any(CompleteCallReqVO.class), eq("device-secret")))
                .thenReturn(CommonResult.success(true));

        CallPhoneMobileV1AdapterController adapter = new CallPhoneMobileV1AdapterController();
        ReflectionTestUtils.setField(adapter, "mobileController", mobileController);
        CallPhoneMobileV1AdapterController.CompleteCallV1ReqVO request = MAPPER.readValue("""
                {"device_event_id":"evt-2","result_code":"connected","started_at":"2026-10-06T09:00:00Z",
                 "ended_at":"2026-10-06T09:03:00Z","duration_seconds":180,"recording_available":true,"note":"已沟通"}
                """, CallPhoneMobileV1AdapterController.CompleteCallV1ReqVO.class);

        adapter.complete(callId, request, "9007199254740997", "device-secret");
        ArgumentCaptor<CompleteCallReqVO> completed = ArgumentCaptor.forClass(CompleteCallReqVO.class);
        verify(mobileController).complete(completed.capture(), eq("device-secret"));

        assertEquals(callId, completed.getValue().getCallRecordId());
        assertEquals("connected", completed.getValue().getResultCode());
        assertEquals("evt-2", completed.getValue().getDeviceEventId());
        assertEquals(180, completed.getValue().getDurationSeconds());
        assertTrue(completed.getValue().isRecordingAvailable());
        assertEquals("已沟通", completed.getValue().getNote());
        assertEquals(9_007_199_254_740_997L, completed.getValue().getDeviceId());
    }

    @Test
    void rejectsIncompleteDispatchAndDirectCallRequests() throws Exception {
        CallPhoneMobileV1AdapterController adapter = new CallPhoneMobileV1AdapterController();
        ReflectionTestUtils.setField(adapter, "mobileController", mock(CallPhoneMobileController.class));
        CallPhoneMobileV1AdapterController.BeginCallReqVO dispatchRequest = MAPPER.readValue(
                "{\"source\":\"pc_dispatch\",\"device_event_id\":\"evt-3\"}",
                CallPhoneMobileV1AdapterController.BeginCallReqVO.class);
        CallPhoneMobileV1AdapterController.BeginCallReqVO directRequest = MAPPER.readValue(
                "{\"source\":\"customer_list\",\"device_event_id\":\"evt-4\"}",
                CallPhoneMobileV1AdapterController.BeginCallReqVO.class);

        ServiceException missingDispatch = assertThrows(ServiceException.class,
                () -> adapter.beginCall(dispatchRequest, "10", "device-secret"));
        ServiceException missingCustomer = assertThrows(ServiceException.class,
                () -> adapter.beginCall(directRequest, "10", "device-secret"));

        assertEquals(1_031_000_089, missingDispatch.getCode());
        assertEquals(1_031_000_089, missingCustomer.getCode());
    }

    @Test
    void rejectsUnsupportedCallSourceDuringRequestValidation() throws Exception {
        CallPhoneMobileV1AdapterController.BeginCallReqVO request = MAPPER.readValue(
                "{\"source\":\"unknown\",\"device_event_id\":\"evt-5\"}",
                CallPhoneMobileV1AdapterController.BeginCallReqVO.class);

        var violations = Validation.buildDefaultValidatorFactory().getValidator().validate(request);

        assertFalse(violations.isEmpty());
        assertEquals("不支持的拨号来源", violations.iterator().next().getMessage());
    }

    @Test
    void diagnosticsReturnsOnlyServiceLicenseAndPairingState() throws Exception {
        EntitlementSnapshotRespVO entitlement = new EntitlementSnapshotRespVO();
        entitlement.setState("available");
        entitlement.setStatus("trial");
        entitlement.setPlanName("must not be exposed");

        var diagnostics = CallPhoneMobileV1AdapterController.toDiagnosticsDTO(entitlement, true);
        JsonNode json = MAPPER.readTree(MAPPER.writeValueAsString(diagnostics));

        assertEquals("available", json.get("data_service").asText());
        assertEquals("active", json.get("license_check").asText());
        assertTrue(json.get("paired").asBoolean());
        assertFalse(json.has("pending_sync_count"));
        assertFalse(json.has("plan_name"));
    }

    @Test
    void diagnosticsDistinguishesMissingLicenseConfigurationAndUnknownStates() {
        EntitlementSnapshotRespVO notConfigured = new EntitlementSnapshotRespVO();
        notConfigured.setState("not_configured");
        EntitlementSnapshotRespVO unknownStatus = new EntitlementSnapshotRespVO();
        unknownStatus.setState("available");
        unknownStatus.setStatus("unknown");

        assertEquals("not_configured",
                CallPhoneMobileV1AdapterController.toDiagnosticsDTO(notConfigured, false).getLicenseCheck());
        assertEquals("unavailable",
                CallPhoneMobileV1AdapterController.toDiagnosticsDTO(unknownStatus, false).getLicenseCheck());
        assertEquals("unavailable",
                CallPhoneMobileV1AdapterController.toDiagnosticsDTO(null, false).getLicenseCheck());
    }

    @Test
    void diagnosticsEndpointUsesThePublishedMobileV1Path() throws Exception {
        String basePath = CallPhoneMobileV1AdapterController.class.getAnnotation(RequestMapping.class).value()[0];
        String endpointPath = CallPhoneMobileV1AdapterController.class.getMethod("diagnostics")
                .getAnnotation(GetMapping.class).value()[0];

        assertEquals("/api/v1/mobile/diagnostics", basePath + endpointPath);
    }
}

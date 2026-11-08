package cn.iocoder.yudao.framework.web.core.handler;
import cn.iocoder.yudao.framework.common.biz.infra.logger.ApiErrorLogCommonApi;
import cn.iocoder.yudao.framework.common.biz.infra.logger.dto.ApiErrorLogCreateReqDTO;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ErrorLogPrivacyTest {
    @Test void exceptionsDoNotPersistRequestOrNestedProviderSecrets() {
        ApiErrorLogCommonApi api=mock(ApiErrorLogCommonApi.class);
        GlobalExceptionHandler handler=new GlobalExceptionHandler("container",api);
        MockHttpServletRequest request=new MockHttpServletRequest("POST","/admin-api/pay/channel/create");
        cn.iocoder.yudao.framework.web.core.util.WebFrameworkUtils.setLoginUserType(request,2);
        request.setContent("{\"config\":\"PAYMENT_SECRET_FIXTURE\"}".getBytes());
        request.setParameter("token","TOKEN_SECRET_FIXTURE");
        RuntimeException error=new RuntimeException("PAYMENT_SECRET_FIXTURE",new IllegalArgumentException("PROVIDER_SECRET_FIXTURE"));
        assertEquals(500,handler.defaultExceptionHandler(request,error).getCode());
        ArgumentCaptor<ApiErrorLogCreateReqDTO> captor=ArgumentCaptor.forClass(ApiErrorLogCreateReqDTO.class);
        verify(api).createApiErrorLogAsync(captor.capture());
        ApiErrorLogCreateReqDTO log=captor.getValue();String saved=log.toString();
        for(String secret:new String[]{"PAYMENT_SECRET_FIXTURE","TOKEN_SECRET_FIXTURE","PROVIDER_SECRET_FIXTURE"})assertFalse(saved.contains(secret));
        assertEquals(RuntimeException.class.getName(),log.getExceptionMessage());
        assertTrue(log.getExceptionStackTrace().contains("ErrorLogPrivacyTest"));
    }
}

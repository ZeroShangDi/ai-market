package cn.iocoder.yudao.module.callphone.controller.admin.customer;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerStageSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomerStageControllerTest {

    @Mock private CustomerStageMapper stageMapper;
    @Mock private CustomerMapper customerMapper;

    private CustomerStageController controller;

    @BeforeEach
    void setUp() {
        controller = new CustomerStageController();
        ReflectionTestUtils.setField(controller, "stageMapper", stageMapper);
        ReflectionTestUtils.setField(controller, "customerMapper", customerMapper);
    }

    @Test
    void optionsDoNotInventEnabledStagesWhenAllConfiguredStagesAreDisabled() {
        when(stageMapper.selectByCode(anyString())).thenAnswer(invocation -> {
            CustomerStageDO stage = new CustomerStageDO();
            stage.setStageCode(invocation.getArgument(0));
            stage.setEnabled(false);
            return stage;
        });
        when(stageMapper.selectEnabledOrdered()).thenReturn(List.of());

        List<?> options = controller.options().getData();

        assertTrue(options.isEmpty());
        verify(stageMapper, never()).insert(any(CustomerStageDO.class));
    }

    @Test
    void defaultInitializationTreatsAConfirmedConcurrentInsertAsSuccess() {
        CustomerStageDO concurrentlyInserted = stage("new", true);
        AtomicInteger newCodeReads = new AtomicInteger();
        when(stageMapper.selectByCode(anyString())).thenAnswer(invocation -> {
            String code = invocation.getArgument(0);
            if (!"new".equals(code)) return null;
            return newCodeReads.incrementAndGet() == 1 ? null : concurrentlyInserted;
        });
        doAnswer(invocation -> {
            CustomerStageDO stage = invocation.getArgument(0);
            if ("new".equals(stage.getStageCode())) throw new DuplicateKeyException("concurrent default insert");
            return 1;
        }).when(stageMapper).insert(any(CustomerStageDO.class));

        ReflectionTestUtils.invokeMethod(controller, "ensureDefaults");

        assertEquals(2, newCodeReads.get());
        verify(stageMapper).selectByCode("following");
        verify(stageMapper).selectByCode("converted");
        verify(stageMapper).selectByCode("paused");
    }

    @Test
    void cannotDisableTheLastEnabledStage() {
        CustomerStageDO existing = stage("new", true);
        existing.setId(91L);
        when(stageMapper.selectById(91L)).thenReturn(existing);
        when(stageMapper.selectEnabledForUpdate()).thenReturn(List.of(existing));

        CustomerStageSaveReqVO request = new CustomerStageSaveReqVO();
        request.setId(91L);
        request.setStageCode("new");
        request.setName("新客户");
        request.setColor("#3B82F6");
        request.setEnabled(false);

        ServiceException error = assertThrows(ServiceException.class, () -> controller.save(request));

        assertEquals(ErrorCodeConstants.CUSTOMER_STAGE_LAST_ENABLED.getCode(), error.getCode());
        verify(stageMapper, never()).updateById(any(CustomerStageDO.class));
    }

    private static CustomerStageDO stage(String code, boolean enabled) {
        CustomerStageDO stage = new CustomerStageDO();
        stage.setStageCode(code);
        stage.setEnabled(enabled);
        return stage;
    }
}

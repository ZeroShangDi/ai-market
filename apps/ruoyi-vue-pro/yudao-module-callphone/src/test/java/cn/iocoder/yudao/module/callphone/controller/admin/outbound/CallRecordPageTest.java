package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo.CallRecordPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.PairedDeviceMapper;
import cn.iocoder.yudao.module.callphone.service.outbound.CallRecordService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CallRecordPageTest {
    @Test
    void emptyPageDoesNotIssueEmptyInQuery() {
        CallRecordService records = mock(CallRecordService.class);
        PairedDeviceMapper devices = mock(PairedDeviceMapper.class);
        AdminUserApi users = mock(AdminUserApi.class);
        CallRecordController controller = new CallRecordController();
        ReflectionTestUtils.setField(controller, "callRecordService", records);
        ReflectionTestUtils.setField(controller, "deviceMapper", devices);
        ReflectionTestUtils.setField(controller, "adminUserApi", users);
        CallRecordPageReqVO request = new CallRecordPageReqVO();
        when(records.getCallRecordPage(request)).thenReturn(new PageResult<>(List.of(), 0L));
        var result = controller.getPage(request).getData();
        assertTrue(result.getList().isEmpty());
        assertEquals(0L, result.getTotal());
        verifyNoInteractions(devices, users);
    }
}

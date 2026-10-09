package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.util.CallPhoneTimeUtils;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.stubbing.Answer;

import java.time.LocalDate;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class CustomerMobileScopeTest {

    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), CustomerDO.class);
    }

    @Test
    void todayScopeUsesShanghaiUtcWindowAndTenantOwnerSoftDeleteFilters() {
        CustomerMapper mapper = mock(CustomerMapper.class, CALLS_REAL_METHODS);
        doAnswer((Answer<IPage<CustomerDO>>) invocation -> invocation.getArgument(0))
                .when(mapper).selectPage(any(IPage.class), any(Wrapper.class));
        CustomerPageReqVO req = new CustomerPageReqVO();
        req.setPageNo(1);
        req.setPageSize(20);

        mapper.selectMobilePage(req, 5L, 7L, "today");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Wrapper<CustomerDO>> queryCaptor = ArgumentCaptor.forClass(Wrapper.class);
        verify(mapper).selectPage(any(IPage.class), queryCaptor.capture());
        String sql = queryCaptor.getValue().getSqlSegment();
        LocalDate businessDate = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        String from = "'" + CallPhoneTimeUtils.businessDayStartUtc(businessDate).toString().replace('T', ' ') + "'";
        String to = "'" + CallPhoneTimeUtils.businessDayStartUtc(businessDate.plusDays(1))
                .toString().replace('T', ' ') + "'";

        assertTrue(sql.contains("tenant_id = 5"));
        assertTrue(sql.contains("owner_user_id = 7"));
        assertTrue(sql.contains("deleted = b'0'"));
        assertTrue(sql.contains("started_at >= " + from));
        assertTrue(sql.contains("started_at < " + to));
    }
}

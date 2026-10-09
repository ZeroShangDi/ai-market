package cn.iocoder.yudao.module.callphone.controller.admin.outbound;

import cn.iocoder.yudao.framework.security.core.LoginUser;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CallDispatchCustomerSearchTest {

    private final CustomerMapper customerMapper = org.mockito.Mockito.mock(CustomerMapper.class);
    private final PiiCryptoService crypto = org.mockito.Mockito.mock(PiiCryptoService.class);
    private final CallDispatchController controller = new CallDispatchController();

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, CustomerDO.class);
    }

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(controller, "customerMapper", customerMapper);
        ReflectionTestUtils.setField(controller, "piiCryptoService", crypto);
        LoginUser loginUser = new LoginUser();
        loginUser.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null));
        when(crypto.decrypt(any(String.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void findsCustomersBeyondTheFormerHundredRowWindowWithinOwnerScope() {
        LocalDateTime newest = LocalDateTime.of(2026, 10, 6, 12, 0);
        List<CustomerDO> firstBatch = new ArrayList<>();
        for (long id = 400; id > 200; id--) {
            firstBatch.add(customer(id, newest, "Customer " + id));
        }
        CustomerDO olderMatch = customer(200L, newest.minusSeconds(1), "Needle Customer");
        when(customerMapper.selectList(any())).thenReturn(firstBatch, List.of(olderMatch));

        var response = controller.getCustomerOptions("needle");

        assertEquals(1, response.getData().size());
        assertEquals(200L, response.getData().get(0).getCustomerId());
        assertEquals("Needle Customer", response.getData().get(0).getCustomerName());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Wrapper<CustomerDO>> queryCaptor = ArgumentCaptor.forClass(Wrapper.class);
        verify(customerMapper, times(2)).selectList(queryCaptor.capture());
        String firstQuery = queryCaptor.getAllValues().get(0).getSqlSegment();
        assertTrue(firstQuery.contains("owner_user_id"));
        assertTrue(firstQuery.contains("status"));
        String secondQuery = queryCaptor.getAllValues().get(1).getSqlSegment();
        assertTrue(secondQuery.contains("update_time"));
        assertTrue(secondQuery.contains("id"));
    }

    private CustomerDO customer(Long id, LocalDateTime updateTime, String name) {
        CustomerDO row = new CustomerDO();
        row.setId(id);
        row.setOwnerUserId(7L);
        row.setStatus("active");
        row.setUpdateTime(updateTime);
        row.setNameCiphertext(name);
        row.setPhoneCiphertext("phone");
        row.setPhoneDisplay("138 **** 0000");
        return row;
    }
}

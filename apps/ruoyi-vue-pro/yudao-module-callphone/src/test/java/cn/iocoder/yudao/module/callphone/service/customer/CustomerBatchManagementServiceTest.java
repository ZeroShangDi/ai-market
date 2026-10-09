package cn.iocoder.yudao.module.callphone.service.customer;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerOwnerChangeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerOwnerChangeMapper;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomerBatchManagementServiceTest {

    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), CustomerDO.class);
    }

    @Mock private CustomerMapper customerMapper;
    @Mock private CustomerOwnerChangeMapper ownerChangeMapper;
    @Mock private AdminUserApi adminUserApi;
    private CustomerBatchManagementServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new CustomerBatchManagementServiceImpl();
        org.springframework.test.util.ReflectionTestUtils.setField(service, "customerMapper", customerMapper);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "ownerChangeMapper", ownerChangeMapper);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "adminUserApi", adminUserApi);
    }

    @Test
    void batchAssignmentChangesOwnerAndWritesNonPiiAudit() {
        CustomerDO customer = customer(101L, 7L, "active");
        when(customerMapper.selectList(any())).thenReturn(List.of(customer));
        when(customerMapper.updateById(customer)).thenReturn(1);

        int changed = service.assignOwners(List.of(101L), 8L, 9L);

        assertEquals(1, changed);
        assertEquals(8L, customer.getOwnerUserId());
        verify(adminUserApi).validateUser(8L);
        ArgumentCaptor<CustomerOwnerChangeDO> event = ArgumentCaptor.forClass(CustomerOwnerChangeDO.class);
        verify(ownerChangeMapper).insert(event.capture());
        assertEquals(101L, event.getValue().getCustomerId());
        assertEquals(7L, event.getValue().getFromOwnerUserId());
        assertEquals(8L, event.getValue().getToOwnerUserId());
        assertEquals(9L, event.getValue().getActorUserId());
    }

    @Test
    void assignmentDoesNotCreateNoopEvents() {
        CustomerDO customer = customer(102L, 8L, "active");
        when(customerMapper.selectList(any())).thenReturn(List.of(customer));

        assertEquals(0, service.assignOwners(List.of(102L), 8L, 9L));

        verify(customerMapper, never()).updateById(any(CustomerDO.class));
        verify(ownerChangeMapper, never()).insert(any(CustomerOwnerChangeDO.class));
    }

    @Test
    void assignmentRejectsTheWholeBatchWhenAnySelectedCustomerIsOutOfScope() {
        when(customerMapper.selectList(any())).thenReturn(List.of());

        assertThrows(ServiceException.class, () -> service.assignOwners(List.of(103L), 8L, 9L));

        verify(customerMapper, never()).updateById(any(CustomerDO.class));
        verify(ownerChangeMapper, never()).insert(any(CustomerOwnerChangeDO.class));
    }

    @Test
    void tagsCanBeAppendedWithoutDuplicatesAndClearedExplicitly() {
        CustomerDO customer = customer(104L, 7L, "active");
        customer.setTags("重点，待联系");
        when(customerMapper.selectList(any())).thenReturn(List.of(customer));
        when(customerMapper.updateById(customer)).thenReturn(1);

        assertEquals(1, service.updateTags(List.of(104L), "append", List.of("重点", "有意向")));
        assertEquals("重点,待联系,有意向", customer.getTags());

        when(customerMapper.selectList(any())).thenReturn(List.of(customer));
        when(customerMapper.updateById(customer)).thenReturn(1);
        assertEquals(1, service.updateTags(List.of(104L), "clear", List.of()));
        assertTrue(customer.getTags() == null || customer.getTags().isEmpty());
    }

    @Test
    void tagsRejectInvalidBatchBeforeReadingCustomers() {
        assertThrows(ServiceException.class,
                () -> service.updateTags(List.of(105L), "append", List.of(" ")));
        verify(customerMapper, never()).selectList(any());
    }

    private CustomerDO customer(Long id, Long ownerUserId, String status) {
        CustomerDO customer = new CustomerDO();
        customer.setId(id);
        customer.setOwnerUserId(ownerUserId);
        customer.setStatus(status);
        return customer;
    }
}

package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.remote.RemoteHrService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmCustomerServiceImplTest {

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmFollowUpMapper followUpMapper;

    @Mock
    private CrmRenewalMapper renewalMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private CrmServiceTicketMapper serviceTicketMapper;

    @Mock
    private RemoteHrService remoteHrService;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    private CrmCustomerServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        TenantContext.setTenantId(100000L);

        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        assistant.setCurrentNamespace("crmCustomerTest");
        TableInfoHelper.initTableInfo(assistant, CrmCustomer.class);
        TableInfoHelper.initTableInfo(assistant, CrmFollowUp.class);
        TableInfoHelper.initTableInfo(assistant, CrmRenewal.class);
        TableInfoHelper.initTableInfo(assistant, CrmReceivable.class);
        TableInfoHelper.initTableInfo(assistant, CrmServiceTicket.class);

        service = spy(new CrmCustomerServiceImpl(
                followUpMapper,
                renewalMapper,
                receivableMapper,
                serviceTicketMapper,
                remoteHrService,
                crmEventPublisher
        ));
        ReflectionTestUtils.setField(service, "baseMapper", customerMapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        TenantContext.clear();
    }

    @Test
    void createCustomer_enrichesOwnerSetsDefaultsAndRefreshesHealth() {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setCustomerTags("核心, 核心, 华东");
        customer.setOwnerId(2001L);

        HrEmployeeSummaryVO employee = new HrEmployeeSummaryVO();
        employee.setEmployeeName("张三");
        employee.setDeptId(3001L);
        employee.setDeptName("销售一部");
        employee.setActive(true);
        when(remoteHrService.getEmployeeByUserId(2001L)).thenReturn(R.ok(employee));

        doReturn(true).when(service).save(any(CrmCustomer.class));
        doNothing().when(service).refreshHealth(6001L);

        boolean result = service.createCustomer(customer);

        assertTrue(result);
        assertEquals("张三", customer.getOwnerName());
        assertEquals(3001L, customer.getDeptId());
        assertEquals("销售一部", customer.getDeptName());
        assertEquals("核心,华东", customer.getCustomerTags());
        assertEquals(CrmConstants.HealthLevel.GREEN, customer.getHealthLevel());
        assertEquals(CrmConstants.CustomerStatus.ACTIVE, customer.getStatus());
        assertEquals(100000L, customer.getTenantId());
        assertEquals(CrmConstants.DelFlag.NORMAL, customer.getDeleted());
        assertNotNull(customer.getCustomerCode());
        verify(crmEventPublisher).publish(eq(CrmEventStreamConstants.EVENT_CUSTOMER_CREATED), eq(100000L), any(Map.class));
        verify(service).refreshHealth(customer.getCustomerId());
    }

    @Test
    void updateCustomer_refreshesHealthAfterOwnershipCheck() {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setCustomerTags("A,B");

        CrmCustomer persisted = new CrmCustomer();
        persisted.setCustomerId(6001L);
        persisted.setTenantId(100000L);
        persisted.setOwnerId(2001L);
        persisted.setOwnerName("张三");
        persisted.setDeptId(3001L);
        persisted.setDeptName("销售一部");
        persisted.setLevelCode("B");
        doReturn(persisted).when(service).getById(6001L);
        doReturn(true).when(service).updateById(any(CrmCustomer.class));
        doNothing().when(service).refreshHealth(6001L);

        boolean result = service.updateCustomer(customer);

        assertTrue(result);
        assertEquals(100000L, customer.getTenantId());
        assertEquals(2001L, customer.getOwnerId());
        assertEquals("张三", customer.getOwnerName());
        assertEquals("B", customer.getLevelCode());
        assertEquals("tester", customer.getUpdateBy());
        verify(remoteHrService, never()).getEmployeeByUserId(any());
        verify(service).refreshHealth(6001L);
    }

    @Test
    void updateCustomer_rejectsDirectOwnerChange() {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setOwnerId(3002L);

        CrmCustomer persisted = new CrmCustomer();
        persisted.setCustomerId(6001L);
        persisted.setTenantId(100000L);
        persisted.setOwnerId(2001L);
        doReturn(persisted).when(service).getById(6001L);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.updateCustomer(customer));

        assertEquals("客户归属变更请走客户领取/公海指派流程", ex.getMessage());
    }

    @Test
    void updateCustomer_rejectsDirectLevelChange() {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setLevelCode("A");

        CrmCustomer persisted = new CrmCustomer();
        persisted.setCustomerId(6001L);
        persisted.setTenantId(100000L);
        persisted.setOwnerId(2001L);
        persisted.setLevelCode("B");
        doReturn(persisted).when(service).getById(6001L);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.updateCustomer(customer));

        assertEquals("客户分级变更请走审批流程", ex.getMessage());
    }

    @Test
    void updateCustomer_rejectsDirectPoolFlagChange() {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setPoolFlag(CrmConstants.CustomerPoolFlag.IN_POOL);

        CrmCustomer persisted = new CrmCustomer();
        persisted.setCustomerId(6001L);
        persisted.setTenantId(100000L);
        persisted.setOwnerId(2001L);
        persisted.setPoolFlag(CrmConstants.CustomerPoolFlag.OUT_OF_POOL);
        doReturn(persisted).when(service).getById(6001L);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.updateCustomer(customer));

        assertEquals("客户公海状态变更请走客户领取/公海释放流程", ex.getMessage());
    }

    @Test
    void refreshHealth_marksCustomerRedWhenRenewalReceivableAndTicketRisksExist() {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setDeleted(CrmConstants.DelFlag.NORMAL);
        doReturn(customer).when(service).getById(6001L);

        CrmFollowUp followUp = new CrmFollowUp();
        followUp.setCustomerId(6001L);
        followUp.setDeleted(CrmConstants.DelFlag.NORMAL);
        followUp.setFollowUpTime(LocalDateTime.now().minusDays(35));
        followUp.setNextFollowUpTime(LocalDateTime.now().plusDays(2));
        when(followUpMapper.selectList(any())).thenReturn(List.of(followUp));

        CrmRenewal renewal = new CrmRenewal();
        renewal.setCustomerId(6001L);
        renewal.setDeleted(CrmConstants.DelFlag.NORMAL);
        renewal.setStatus(CrmConstants.RenewalStatus.PLANNED);
        renewal.setCurrentExpireDate(LocalDate.now().plusDays(10));
        when(renewalMapper.selectList(any())).thenReturn(List.of(renewal));

        CrmReceivable receivable = new CrmReceivable();
        receivable.setCustomerId(6001L);
        receivable.setDeleted(CrmConstants.DelFlag.NORMAL);
        receivable.setDueDate(LocalDate.now().minusDays(45));
        receivable.setOutstandingAmount(new BigDecimal("12000"));
        when(receivableMapper.selectList(any())).thenReturn(List.of(receivable));

        when(serviceTicketMapper.selectCount(any())).thenReturn(1L, 1L);

        service.refreshHealth(6001L);

        ArgumentCaptor<LambdaUpdateWrapper> captor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(customerMapper).update(isNull(), captor.capture());
        String sqlSet = captor.getValue().getSqlSet();
        assertTrue(sqlSet.contains("health_level"));
        assertTrue(sqlSet.contains("health_reason"));
        assertTrue(sqlSet.contains("last_follow_up_time"));
        assertTrue(sqlSet.contains("next_follow_up_time"));
    }
}

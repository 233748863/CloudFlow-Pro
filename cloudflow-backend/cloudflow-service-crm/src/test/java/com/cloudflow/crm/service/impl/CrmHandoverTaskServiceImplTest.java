package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmHandoverTaskMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.remote.RemoteHrService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.eq;

@ExtendWith(MockitoExtension.class)
class CrmHandoverTaskServiceImplTest {

    @Mock
    private CrmHandoverTaskMapper handoverTaskMapper;

    @Mock
    private CrmLeadMapper leadMapper;

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmOpportunityMapper opportunityMapper;

    @Mock
    private CrmQuoteMapper quoteMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private CrmRenewalMapper renewalMapper;

    @Mock
    private CrmServiceTicketMapper serviceTicketMapper;

    @Mock
    private RemoteHrService remoteHrService;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    private CrmHandoverTaskServiceImpl service;

    @BeforeEach
    void setUp() {
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        assistant.setCurrentNamespace("crmHandoverTaskTest");
        TableInfoHelper.initTableInfo(assistant, CrmLead.class);
        TableInfoHelper.initTableInfo(assistant, CrmCustomer.class);
        TableInfoHelper.initTableInfo(assistant, CrmOpportunity.class);
        TableInfoHelper.initTableInfo(assistant, CrmQuote.class);
        TableInfoHelper.initTableInfo(assistant, CrmReceivable.class);
        TableInfoHelper.initTableInfo(assistant, CrmRenewal.class);
        TableInfoHelper.initTableInfo(assistant, CrmServiceTicket.class);
        TableInfoHelper.initTableInfo(assistant, CrmHandoverTask.class);

        service = new CrmHandoverTaskServiceImpl(
                handoverTaskMapper,
                leadMapper,
                customerMapper,
                opportunityMapper,
                quoteMapper,
                receivableMapper,
                renewalMapper,
                serviceTicketMapper,
                remoteHrService,
                crmEventPublisher
        );
    }

    @Test
    void generateForEmployeeLeft_createsPendingTasksForOpenRecords() {
        CrmLead lead = new CrmLead();
        lead.setLeadId(5101L);
        lead.setLeadName("华东新线索");

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6101L);
        customer.setCustomerName("景曜科技");

        when(leadMapper.selectList(any())).thenReturn(List.of(lead));
        when(customerMapper.selectList(any())).thenReturn(List.of(customer));
        when(opportunityMapper.selectList(any())).thenReturn(List.of());
        when(quoteMapper.selectList(any())).thenReturn(List.of());
        when(receivableMapper.selectList(any())).thenReturn(List.of());
        when(renewalMapper.selectList(any())).thenReturn(List.of());
        when(serviceTicketMapper.selectList(any())).thenReturn(List.of());
        when(handoverTaskMapper.selectCount(any())).thenReturn(0L);

        int created = service.generateForEmployeeLeft(100000L, 2001L, "张三", 3001L, "msg-001", null);

        assertEquals(2, created);
        verify(remoteHrService, never()).getEmployeeByUserId(any());

        ArgumentCaptor<CrmHandoverTask> captor = ArgumentCaptor.forClass(CrmHandoverTask.class);
        verify(handoverTaskMapper, times(2)).insert(captor.capture());
        List<CrmHandoverTask> tasks = captor.getAllValues();

        assertEquals("CRM_LEAD", tasks.get(0).getBusinessType());
        assertEquals(5101L, tasks.get(0).getBusinessId());
        assertEquals("华东新线索", tasks.get(0).getBusinessName());
        assertEquals(100000L, tasks.get(0).getTenantId());
        assertEquals(2001L, tasks.get(0).getFromOwnerId());
        assertEquals("PENDING", tasks.get(0).getStatus());
        assertEquals("EMPLOYEE_LEFT", tasks.get(0).getTriggerSource());
        assertEquals("msg-001", tasks.get(0).getTriggerEventId());

        assertEquals("CRM_CUSTOMER", tasks.get(1).getBusinessType());
        assertEquals(6101L, tasks.get(1).getBusinessId());
        assertEquals("景曜科技", tasks.get(1).getBusinessName());
        assertEquals("PENDING", tasks.get(1).getStatus());
    }

    @Test
    void generateForEmployeeLeft_withSuccessor_autoReassignsAndWritesSummaryTask() {
        HrEmployeeSummaryVO successor = new HrEmployeeSummaryVO();
        successor.setEmployeeName("李四");
        when(remoteHrService.getEmployeeByUserId(2002L)).thenReturn(R.ok(successor));
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6101L);
        customer.setCustomerName("景曜科技");
        customer.setTenantId(100000L);
        when(customerMapper.selectList(any())).thenReturn(List.of(customer));

        when(leadMapper.update(isNull(), any())).thenReturn(1);
        when(customerMapper.update(isNull(), any())).thenReturn(1);
        when(opportunityMapper.update(isNull(), any())).thenReturn(0);
        when(quoteMapper.update(isNull(), any())).thenReturn(0);
        when(receivableMapper.update(isNull(), any())).thenReturn(0);
        when(renewalMapper.update(isNull(), any())).thenReturn(0);
        when(serviceTicketMapper.update(isNull(), any())).thenReturn(0);

        int updated = service.generateForEmployeeLeft(100000L, 2001L, "张三", 3001L, "msg-002", 2002L);

        assertEquals(2, updated);
        verify(leadMapper).update(isNull(), any());
        verify(customerMapper).update(isNull(), any());
        verify(handoverTaskMapper).insert(any(CrmHandoverTask.class));

        ArgumentCaptor<CrmHandoverTask> captor = ArgumentCaptor.forClass(CrmHandoverTask.class);
        verify(handoverTaskMapper).insert(captor.capture());
        CrmHandoverTask summary = captor.getValue();
        assertEquals("AUTO_REASSIGN", summary.getBusinessType());
        assertEquals(0L, summary.getBusinessId());
        assertEquals("REASSIGNED", summary.getStatus());
        assertEquals(2002L, summary.getToOwnerId());
        assertEquals("李四", summary.getToOwnerName());
        assertEquals(100000L, summary.getTenantId());
        assertEquals("employee offboard auto reassign processed records=2", summary.getRemark());
        verify(crmEventPublisher).publish(eq(com.cloudflow.crm.config.CrmEventStreamConstants.EVENT_CUSTOMER_OWNER_CHANGED),
                eq(100000L), any());
    }

    @Test
    void reassign_customerTask_publishesOwnerChangedEvent() {
        CrmHandoverTask task = new CrmHandoverTask();
        task.setHandoverId(9001L);
        task.setTenantId(100000L);
        task.setBusinessType("CRM_CUSTOMER");
        task.setBusinessId(6101L);
        task.setBusinessName("景曜科技");
        task.setFromOwnerId(2001L);
        task.setFromOwnerName("张三");
        task.setStatus("PENDING");
        task.setDeleted(CrmConstants.DelFlag.NORMAL);
        when(handoverTaskMapper.selectById(9001L)).thenReturn(task);
        when(customerMapper.update(isNull(), any())).thenReturn(1);
        when(handoverTaskMapper.updateById(any(CrmHandoverTask.class))).thenReturn(1);

        int updated = service.reassign(9001L, 2002L, "李四", "人工交接");

        assertEquals(1, updated);
        verify(crmEventPublisher).publish(eq(com.cloudflow.crm.config.CrmEventStreamConstants.EVENT_CUSTOMER_OWNER_CHANGED),
                eq(100000L), any());
    }
}

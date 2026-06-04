package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.domain.CrmAssignmentRule;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmCustomerPoolLog;
import com.cloudflow.crm.mapper.CrmAssignmentRuleMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmCustomerPoolLogMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collection;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmCustomerPoolServiceImplTest {

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmCustomerPoolLogMapper poolLogMapper;

    @Mock
    private CrmAssignmentRuleMapper assignmentRuleMapper;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    private CrmCustomerPoolServiceImpl service;

    @BeforeEach
    void setUp() {
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        assistant.setCurrentNamespace("crmCustomerPoolTest");
        TableInfoHelper.initTableInfo(assistant, CrmCustomer.class);
        TableInfoHelper.initTableInfo(assistant, CrmCustomerPoolLog.class);
        service = new CrmCustomerPoolServiceImpl(customerMapper, poolLogMapper, assignmentRuleMapper, crmEventPublisher);
    }

    @Test
    void triggerAutoRelease_movesInactiveCustomersBackToPoolAndWritesLog() {
        CrmAssignmentRule rule = new CrmAssignmentRule();
        rule.setRuleId(77L);
        rule.setRuleName("30天未跟进自动回收");
        rule.setRuleType(CrmConstants.AssignmentRuleType.AUTO_RELEASE);
        rule.setStatus(CrmConstants.AssignmentRuleStatus.ACTIVE);
        rule.setInactiveDays(30);
        rule.setDeleted(CrmConstants.DelFlag.NORMAL);

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setTenantId(100000L);
        customer.setCustomerName("景曜科技");
        customer.setPoolFlag(CrmConstants.CustomerPoolFlag.OUT_OF_POOL);
        customer.setOwnerId(2001L);
        customer.setOwnerName("tester");
        customer.setDeleted(CrmConstants.DelFlag.NORMAL);

        when(assignmentRuleMapper.selectList(any())).thenReturn(List.of(rule));
        when(customerMapper.selectList(any())).thenReturn(List.of(customer));
        when(customerMapper.update(isNull(), any())).thenReturn(1);

        int released = service.triggerAutoRelease();

        assertEquals(1, released);

        ArgumentCaptor<LambdaUpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(customerMapper).update(isNull(), wrapperCaptor.capture());
        Collection<Object> values = wrapperCaptor.getValue().getParamNameValuePairs().values();
        assertTrue(values.contains(CrmConstants.CustomerPoolFlag.IN_POOL));
        assertTrue(values.contains(customer.getOwnerId()));
        assertTrue(values.contains(customer.getOwnerName()));

        ArgumentCaptor<CrmCustomerPoolLog> logCaptor = ArgumentCaptor.forClass(CrmCustomerPoolLog.class);
        verify(poolLogMapper).insert(logCaptor.capture());
        CrmCustomerPoolLog log = logCaptor.getValue();
        assertEquals(6001L, log.getCustomerId());
        assertEquals("景曜科技", log.getCustomerName());
        assertEquals(CrmConstants.PoolAction.AUTO_RELEASE, log.getActionType());
        assertEquals(2001L, log.getFromOwnerId());
        assertEquals("tester", log.getFromOwnerName());
        assertEquals(77L, log.getRuleId());
        assertTrue(String.valueOf(log.getReason()).contains("30"));
        verify(crmEventPublisher).publish(
                org.mockito.ArgumentMatchers.eq(CrmEventStreamConstants.EVENT_CUSTOMER_OWNER_CHANGED),
                org.mockito.ArgumentMatchers.eq(100000L),
                org.mockito.ArgumentMatchers.anyMap());
    }
}

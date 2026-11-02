package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.CrmSlaPolicy;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.mapper.CrmSlaPolicyMapper;
import com.cloudflow.crm.mapper.CrmStaffMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CrmSlaLeaderTest {
    private final CrmServiceTicketMapper tickets = mock(CrmServiceTicketMapper.class);
    private final CrmSlaPolicyMapper policies = mock(CrmSlaPolicyMapper.class);
    private final CrmStaffMapper staff = mock(CrmStaffMapper.class);
    private final MessageSender messages = mock(MessageSender.class);
    private final TransactionTemplate transactions = mock(TransactionTemplate.class);
    private final CrmSlaService service = new CrmSlaService(
            null, null, policies, tickets, staff, messages, null, null, transactions);

    @BeforeEach
    void setUpBreach() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), CrmServiceTicket.class);
        UserContext.setTenantId(100001L);
        CrmServiceTicket ticket = new CrmServiceTicket();
        ticket.setTicketId(5L);
        ticket.setTenantId(100001L);
        ticket.setTicketTitle("时限测试");
        ticket.setOwnerId(7L);
        ticket.setSlaPolicyId(2L);
        ticket.setSlaStatus("RESPONSE_BREACHED");
        ticket.setResponseBreachedFlag(1);
        ticket.setResolutionBreachedFlag(0);
        when(tickets.selectList(any())).thenReturn(List.of(ticket));
        when(tickets.lockById(5L)).thenReturn(ticket);
        when(policies.selectById(2L)).thenReturn(new CrmSlaPolicy());
        when(transactions.execute(any())).thenAnswer(invocation -> {
            TransactionCallback<Integer> action = invocation.getArgument(0);
            return action.doInTransaction(mock(TransactionStatus.class));
        });
    }

    @AfterEach
    void clearContext() {
        UserContext.clear();
        TenantContext.clear();
    }

    @Test
    void breachNotifiesOwnerAndExactLeaderInCurrentTenant() {
        when(staff.selectUserDept(7L, 100001L)).thenReturn(10L);
        when(staff.selectDepartment(10L, 100001L)).thenReturn(department(0L, 42L));
        when(staff.selectActiveUserId(42L, 100001L)).thenReturn(42L);

        service.scanBreaches();

        assertReceivers(7L, 42L);
        verify(staff).selectUserDept(7L, 100001L);
        verify(staff).selectDepartment(10L, 100001L);
        verify(staff).selectActiveUserId(42L, 100001L);
        verifyNoMoreInteractions(staff);
    }

    @Test
    void skipsSelfAndUnavailableLeaderWhileTraversingParents() {
        when(staff.selectUserDept(7L, 100001L)).thenReturn(10L);
        when(staff.selectDepartment(10L, 100001L)).thenReturn(department(20L, 7L));
        when(staff.selectDepartment(20L, 100001L)).thenReturn(department(30L, 88L));
        when(staff.selectActiveUserId(88L, 100001L)).thenReturn(null);
        when(staff.selectDepartment(30L, 100001L)).thenReturn(department(0L, 42L));
        when(staff.selectActiveUserId(42L, 100001L)).thenReturn(42L);

        service.scanBreaches();

        assertReceivers(7L, 42L);
        verify(staff, never()).selectActiveUserId(7L, 100001L);
        verify(staff).selectActiveUserId(88L, 100001L);
        verify(staff, never()).selectActiveUserId(88L, 100000L);
    }

    @Test
    void missingTenantRejectsLeaderNotificationBeforeStaffLookup() {
        UserContext.clear();
        TenantContext.clear();

        assertThrows(IllegalStateException.class, service::scanBreaches);

        verifyNoInteractions(staff, messages);
    }

    private CrmStaffMapper.Department department(Long parentId, Long leaderUserId) {
        CrmStaffMapper.Department department = new CrmStaffMapper.Department();
        department.setParentId(parentId);
        department.setLeaderUserId(leaderUserId);
        return department;
    }

    private void assertReceivers(Long... expected) {
        ArgumentCaptor<MessageSendRequest> request = ArgumentCaptor.forClass(MessageSendRequest.class);
        verify(messages).send(request.capture());
        assertEquals(List.of(expected), request.getValue().getReceivers().stream()
                .map(MessageReceiver::getReceiverId).toList());
    }
}

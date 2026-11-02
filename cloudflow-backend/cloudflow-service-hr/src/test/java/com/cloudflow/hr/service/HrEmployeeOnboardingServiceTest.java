package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.registry.HrWorkflowBusinessTypes;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrLifecycleDetail;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrLifecycleDetailMapper;
import com.cloudflow.hr.exception.HrBusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HrEmployeeOnboardingServiceTest {
    @AfterEach void clearContext() { UserContext.clear(); TenantContext.clear(); }

    @Test
    void localTransactionCommitsBeforeRemoteStartAndFailureKeepsRetryableApplication() {
        UserContext.setTenantId(100000L);
        UserContext.setUserId(91L);
        AtomicBoolean inTransaction = new AtomicBoolean();
        AtomicBoolean committedApplication = new AtomicBoolean();
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(call -> {
            TransactionDefinition definition = call.getArgument(0);
            inTransaction.set(definition.getPropagationBehavior() != TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
            return new SimpleTransactionStatus();
        });
        doAnswer(call -> { committedApplication.set(true); inTransaction.set(false); return null; }).when(manager).commit(any());
        HrLifecycleService lifecycle = mock(HrLifecycleService.class);
        HrTypedCrudService crud = mock(HrTypedCrudService.class);
        HrEmployeeMapper employees = mock(HrEmployeeMapper.class);
        HrLifecycleApplicationMapper applications = mock(HrLifecycleApplicationMapper.class);
        HrLifecycleDetailMapper details = mock(HrLifecycleDetailMapper.class);
        WorkflowServiceClient workflow = mock(WorkflowServiceClient.class);
        OutboxPublisher outbox = mock(OutboxPublisher.class);
        RuntimeSysConfigService config = mock(RuntimeSysConfigService.class);
        ObjectMapper json = new ObjectMapper();
        when(config.getString(anyString(), anyString())).thenAnswer(call -> call.getArgument(1));
        when(lifecycle.nextApplicationNo()).thenReturn("HRLC12");
        when(lifecycle.createApplication(any(HrLifecycleApplicationPayload.class), anyMap())).thenAnswer(call -> {
            assertTrue(inTransaction.get());
            return 12L;
        });
        when(crud.toInternalMap(any())).thenReturn(Map.of());
        when(employees.selectCount(any())).thenReturn(0L);
        when(applications.selectList(any())).thenReturn(List.of());
        HrLifecycleApplication application = new HrLifecycleApplication();
        application.setId(12L);
        application.setTenantId(100000L);
        application.setType("ONBOARDING");
        application.setApplicationNo("HRLC12");
        application.setStatus("APPROVING");
        when(applications.selectById(12L)).thenReturn(application);
        HrLifecycleDetail detail = new HrLifecycleDetail();
        detail.setDetailJson(json.createObjectNode().put("employeeCreationSource", "EMPLOYEE_DIALOG_WORKFLOW"));
        when(details.selectOnboardingDetail(100000L, 12L)).thenReturn(detail);
        when(workflow.startProcess(any())).thenAnswer(call -> {
            assertFalse(inTransaction.get());
            assertTrue(committedApplication.get());
            verify(outbox).publish(any(BusinessEventEnvelope.class));
            ProcessStartDTO request = call.getArgument(0);
            assertEquals(HrWorkflowBusinessTypes.LIFECYCLE, request.getBusinessType());
            assertEquals(12L, request.getBusinessId());
            return R.fail("retry submitted");
        });
        HrEmployeeOnboardingService service = new HrEmployeeOnboardingService(lifecycle, mock(HrViewSupport.class),
                crud, workflow, config, employees, applications, details, json, manager, outbox);
        HrEmployeePayload payload = new HrEmployeePayload();
        payload.setEmployeeNo("E12");
        payload.setName("employee");
        payload.setEmployeeStatus("PENDING");
        HrBusinessException failure = assertThrows(HrBusinessException.class, () -> service.submit(payload));
        assertEquals("WORKFLOW_START_FAILED", failure.getCode());
        verify(workflow).startProcess(any());
        verify(manager).commit(any());
        verify(applications, never()).deleteById(anyLong());
        verify(applications, never()).update(any(), any());
    }
}

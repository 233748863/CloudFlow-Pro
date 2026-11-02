package com.cloudflow.hr.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.workflow.callback.registry.HrWorkflowBusinessTypes;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrLifecycleDetailMapper;
import com.cloudflow.hr.exception.HrBusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HrEmployeeOnboardingServiceTest {
    @Test
    void localTransactionCommitsBeforeRemoteStartAndFailureKeepsRetryableApplication() {
        AtomicBoolean inTransaction = new AtomicBoolean();
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(call -> {
            inTransaction.set(true);
            return new SimpleTransactionStatus();
        });
        doAnswer(call -> { inTransaction.set(false); return null; }).when(manager).commit(any());
        HrLifecycleService lifecycle = mock(HrLifecycleService.class);
        HrTypedCrudService crud = mock(HrTypedCrudService.class);
        HrEmployeeMapper employees = mock(HrEmployeeMapper.class);
        HrLifecycleApplicationMapper applications = mock(HrLifecycleApplicationMapper.class);
        WorkflowServiceClient workflow = mock(WorkflowServiceClient.class);
        RuntimeSysConfigService config = mock(RuntimeSysConfigService.class);
        when(config.getString(anyString(), anyString())).thenAnswer(call -> call.getArgument(1));
        when(lifecycle.nextApplicationNo()).thenReturn("HRLC12");
        when(lifecycle.createApplication(any(HrLifecycleApplicationPayload.class), anyMap())).thenAnswer(call -> {
            assertTrue(inTransaction.get());
            return 12L;
        });
        when(crud.toMap(any())).thenReturn(Map.of());
        when(employees.selectCount(any())).thenReturn(0L);
        when(applications.selectList(any())).thenReturn(List.of());
        when(workflow.startProcess(any())).thenAnswer(call -> {
            assertFalse(inTransaction.get());
            ProcessStartDTO request = call.getArgument(0);
            assertEquals(HrWorkflowBusinessTypes.LIFECYCLE, request.getBusinessType());
            assertEquals(12L, request.getBusinessId());
            return R.fail("retry submitted");
        });
        HrEmployeeOnboardingService service = new HrEmployeeOnboardingService(lifecycle, mock(HrViewSupport.class),
                crud, workflow, config, employees, applications, mock(HrLifecycleDetailMapper.class),
                new ObjectMapper(), new TransactionTemplate(manager));
        HrEmployeePayload payload = new HrEmployeePayload();
        payload.setEmployeeNo("E12");
        payload.setName("员工");
        payload.setEmployeeStatus("PENDING");
        assertThrows(HrBusinessException.class, () -> service.submit(payload));
        verify(manager).commit(any());
        verify(manager, never()).rollback(any());
        verify(applications, never()).deleteById(anyLong());
        verify(applications, never()).update(any(), any());
    }
}

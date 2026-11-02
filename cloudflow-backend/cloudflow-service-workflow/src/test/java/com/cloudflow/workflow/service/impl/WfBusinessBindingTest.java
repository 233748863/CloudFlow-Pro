package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class WfBusinessBindingTest {
    @Mock WfProcessInstanceMapper instances;
    @InjectMocks WfInstanceServiceImpl service;

    @Test
    void businessCancellationRequiresExactRegisteredType() throws Exception {
        Long previousTenant = UserContext.getTenantId();
        try (AutoCloseable mocks = MockitoAnnotations.openMocks(this)) {
            UserContext.setTenantId(100000L);
            WfProcessInstance instance = new WfProcessInstance();
            instance.setTenantId(100000L);
            instance.setVariables("{\"businessType\":\"HR_LIFECYCLE\",\"businessId\":12}");
            when(instances.selectById("pi-12")).thenReturn(instance);
            assertThrows(PermissionDeniedException.class, () -> service.invalidateProcessByBusiness(
                    100000L, "pi-12", "LIFECYCLE", 12L, "撤销"));
            verify(instances, times(1)).selectById("pi-12");
            verifyNoMoreInteractions(instances);
        } finally {
            UserContext.setTenantId(previousTenant);
        }
    }
}

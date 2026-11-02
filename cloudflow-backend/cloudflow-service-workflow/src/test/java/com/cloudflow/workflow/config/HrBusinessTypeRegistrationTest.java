package com.cloudflow.workflow.config;

import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.common.workflow.callback.registry.HrWorkflowBusinessTypes;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HrBusinessTypeRegistrationTest {
    @Test
    void registersBothPerformanceStagesAndActualHrInstanceColumns() {
        BusinessTypeRegistry registry = new BusinessTypeRegistry();
        new WorkflowBusinessTypeContributor().contribute(registry);
        var plan = registry.get(HrWorkflowBusinessTypes.PERFORMANCE_PLAN);
        var result = registry.get(HrWorkflowBusinessTypes.PERFORMANCE_RESULT);
        assertEquals("plan_process_instance_id", plan.getProcessInstanceIdField());
        assertEquals("result_process_instance_id", result.getProcessInstanceIdField());
        assertEquals(List.of("PLAN_APPROVING"), plan.getApprovingStatuses());
        assertEquals(List.of("RESULT_APPROVING"), result.getApprovingStatuses());
        assertTrue(plan.getFinishedStatuses().contains("RESULT_APPROVING"));
        assertEquals("sign_status", registry.get(HrWorkflowBusinessTypes.CONTRACT_SIGN).getStatusField());
        assertEquals("instance_id", registry.get(HrWorkflowBusinessTypes.ATTENDANCE_APPEAL).getProcessInstanceIdField());
        assertFalse(registry.contains("HR_PERFORMANCE_OBJECTIVE"));
    }
}

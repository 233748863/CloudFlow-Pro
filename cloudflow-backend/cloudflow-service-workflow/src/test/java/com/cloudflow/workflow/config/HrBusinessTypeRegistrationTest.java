package com.cloudflow.workflow.config;

import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.HrWorkflowBusinessTypes;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class HrBusinessTypeRegistrationTest {
    @Test
    void registersBothPerformanceStagesAndActualHrInstanceColumns() {
        BusinessTypeRegistry registry = new BusinessTypeRegistry();
        new WorkflowBusinessTypeContributor().contribute(registry);
        BusinessTypeDef plan = registry.get(HrWorkflowBusinessTypes.PERFORMANCE_PLAN);
        BusinessTypeDef result = registry.get(HrWorkflowBusinessTypes.PERFORMANCE_RESULT);
        assertEquals("plan_process_instance_id", plan.getProcessInstanceIdField());
        assertEquals("result_process_instance_id", result.getProcessInstanceIdField());
        assertEquals(List.of("PLAN_APPROVING"), plan.getPendingStatuses());
        assertEquals(List.of("RESULT_APPROVING"), result.getPendingStatuses());
        assertTrue(plan.getFinishedStatuses().contains("RESULT_APPROVING"));
        assertEquals("sign_status", registry.get(HrWorkflowBusinessTypes.CONTRACT_SIGN).getStatusField());
        assertEquals("instance_id", registry.get(HrWorkflowBusinessTypes.ATTENDANCE_APPEAL).getProcessInstanceIdField());
        assertEquals(List.of("IN_PROGRESS"), registry.get(HrWorkflowBusinessTypes.TALENT_SUCCESSION).getPendingStatuses());
        assertEquals(List.of("DETERMINING"), registry.get(HrWorkflowBusinessTypes.WORK_INJURY).getPendingStatuses());
        assertEquals("correction_id", registry.get(HrWorkflowBusinessTypes.PAYROLL_CORRECTION).getIdField());
        assertTrue(registry.contains(HrWorkflowBusinessTypes.OFFER));
        assertFalse(registry.contains("OFFER"));
        assertFalse(registry.contains("HR_PERFORMANCE_OBJECTIVE"));
    }
}

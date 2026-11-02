package com.cloudflow.hr.service;

import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.registry.HrWorkflowBusinessTypes;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.WfCallbackSideEffectMapper;
import com.cloudflow.hr.service.impl.HrWorkflowCallbackServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HrWorkflowCallbackContractTest {
    @Mock HrTypedCrudService crud;
    @Mock HrEmployeeOnboardingService onboarding;
    @Mock WfCallbackSideEffectMapper sideEffects;
    @InjectMocks HrWorkflowCallbackServiceImpl callback;
    AutoCloseable mocks;

    @BeforeEach void setup() { mocks = MockitoAnnotations.openMocks(this); }
    @AfterEach void close() throws Exception { mocks.close(); }

    private ApprovalResultDTO approved(String businessType) {
        ApprovalResultDTO result = new ApprovalResultDTO();
        result.setTenantId(100000L);
        result.setBusinessType(businessType);
        result.setBusinessId(12L);
        result.setProcessInstanceId("pi-12");
        result.setApprovalResult("APPROVED");
        return result;
    }

    @Test
    void registeredRecruitmentAndCompensationTypesReachTheirRecords() {
        callback.handleApprovalResult(approved(HrWorkflowBusinessTypes.RECRUITMENT));
        verify(crud).updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(eq(HrRecruitmentRequisition.class),
                eq(12L), eq("pi-12"), eq("status"), any(), eq(Map.of("status", "RECRUITING")), eq("processInstanceId"));
        callback.handleApprovalResult(approved(HrWorkflowBusinessTypes.COMP_CHANGE));
        verify(crud).updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(eq(HrCompChange.class),
                eq(12L), eq("pi-12"), eq("status"), any(), eq(Map.of("status", "APPROVED")), eq("processInstanceId"));
        assertThrows(HrBusinessException.class, () -> callback.handleApprovalResult(approved("RECRUITMENT_REQUEST")));
    }

    @Test
    void performanceStagesMatchOnlyTheirOwnInstanceAndStatus() {
        callback.handleApprovalResult(approved(HrWorkflowBusinessTypes.PERFORMANCE_PLAN));
        verify(crud).updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(HrPerformanceObjective.class,
                12L, "pi-12", "status", Set.of("PLAN_APPROVING"), Map.of("status", "PLAN_APPROVED"), "planProcessInstanceId");
        callback.handleApprovalResult(approved(HrWorkflowBusinessTypes.PERFORMANCE_RESULT));
        verify(crud).updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(HrPerformanceObjective.class,
                12L, "pi-12", "status", Set.of("RESULT_APPROVING"), Map.of("status", "COMPLETED"), "resultProcessInstanceId");
    }

    @Test
    void lifecycleUsesPersistedSubtypeAndCanonicalSideEffectKey() {
        when(crud.updatePropertiesIfWorkflowInstanceMatchesAndCurrentStatusIn(eq(HrLifecycleApplication.class),
                anyLong(), anyString(), anyString(), any(), anyMap(), any(String[].class))).thenReturn(true);
        when(crud.get(HrLifecycleApplication.class, 12L)).thenReturn(Map.of("type", "ONBOARDING"));
        when(onboarding.isEmployeeCreationRequest(12L)).thenReturn(true);
        callback.handleApprovalResult(approved(HrWorkflowBusinessTypes.LIFECYCLE));
        verify(onboarding).createEmployeeFromApprovedApplication(12L);
        verify(sideEffects).insert(argThat((WfCallbackSideEffect marker) ->
                HrWorkflowBusinessTypes.LIFECYCLE.equals(marker.getBusinessType())
                        && "ONBOARDING_CREATE_EMPLOYEE".equals(marker.getEffectKey())));
    }
}

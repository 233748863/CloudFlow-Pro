package com.cloudflow.workflow.util;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import com.cloudflow.workflow.domain.dto.SafetyCheckResultDTO;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SafetyCheckerTest {
    private final WfProcessDefinitionMapper definitions = mock(WfProcessDefinitionMapper.class);
    private final WfProcessInstanceMapper instances = mock(WfProcessInstanceMapper.class);
    private final WorkflowPermissionService permissions = mock(WorkflowPermissionService.class);
    private final SafetyChecker checker = new SafetyChecker(definitions, instances, permissions);

    @Test
    void sharesDefinitionsWithoutLosingMissingRunningOrTenantChecks() {
        when(definitions.selectBatchIds(any())).thenReturn(List.of(definition("owned", 100L), definition("foreign", 200L)));
        when(instances.selectCount(any())).thenReturn(1L);
        try (MockedStatic<UserContext> context = mockStatic(UserContext.class)) {
            context.when(UserContext::getUserId).thenReturn(42L);
            context.when(UserContext::getTenantId).thenReturn(100L);
            SafetyCheckResultDTO result = checker.checkSafety(List.of("owned", "foreign", "missing"));
            assertFalse(result.getSafe());
            assertTrue(result.getErrors().contains("流程不存在: missing"));
            assertEquals(List.of("owned", "foreign"), result.getWorkflowsWithRunningInstances());
            assertEquals(List.of("foreign"), result.getWorkflowsWithoutPermission());
        }
        verify(definitions).selectBatchIds(List.of("owned", "foreign", "missing"));
        verify(definitions, never()).selectById(any());
    }

    @Test
    void externalDependenciesRemainWarnings() {
        when(definitions.selectBatchIds(any())).thenReturn(List.of(definition("owned", 100L)));
        when(definitions.selectList(any())).thenReturn(List.of(definition("external", 100L)));
        try (MockedStatic<UserContext> context = mockStatic(UserContext.class)) {
            context.when(UserContext::getUserId).thenReturn(42L);
            context.when(UserContext::getTenantId).thenReturn(100L);
            SafetyCheckResultDTO result = checker.checkSafety(List.of("owned"));
            assertTrue(result.getSafe());
            assertEquals(List.of("owned"), result.getWorkflowsWithDependencies());
            assertEquals(1, result.getWarnings().size());
        }
    }

    @Test
    void emptySelectionDoesNotQuery() {
        assertFalse(checker.checkSafety(List.of()).getSafe());
        verifyNoInteractions(definitions, instances, permissions);
    }

    private WfProcessDefinition definition(String id, Long tenantId) {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId(id);
        definition.setTenantId(tenantId);
        definition.setCreateBy("42");
        return definition;
    }
}

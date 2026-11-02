package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.INodeExecutionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class WfDoneTasksTest {
    @Mock WfTaskHistoryMapper historyMapper;
    @Mock WfProcessInstanceMapper instanceMapper;
    @Mock WfProcessDefinitionMapper definitionMapper;
    @Mock WorkflowGraphModelResolver resolver;
    @Mock INodeExecutionService execution;
    @InjectMocks WfTaskServiceImpl service;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        List<WfTaskHistory> histories = IntStream.range(0, 8).mapToObj(i -> {
            WfTaskHistory history = new WfTaskHistory();
            history.setTaskId("task-" + i);
            history.setInstanceId("instance-" + i);
            history.setNodeKey("approve");
            return history;
        }).toList();
        when(historyMapper.selectPage(any(), any())).thenReturn(new Page<WfTaskHistory>(1, 10, 8).setRecords(histories));
        when(instanceMapper.selectBatchIds(any())).thenReturn(IntStream.range(0, 8).mapToObj(i -> {
            WfProcessInstance instance = new WfProcessInstance();
            instance.setInstanceId("instance-" + i);
            instance.setDefinitionId("definition");
            return instance;
        }).toList());
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId("definition");
        definition.setProcessName("审批");
        definition.setModelJson("model");
        when(definitionMapper.selectBatchIds(any())).thenReturn(List.of(definition));
    }

    @AfterEach
    void closeMocks() throws Exception {
        UserContext.clear();
        mocks.close();
    }

    @Test
    void sharedDefinitionIsParsedOnceAndEveryTaskKeepsStepInformation() {
        WfNodeConfig root = new WfNodeConfig();
        when(resolver.parseRuntimeRoot("model")).thenReturn(root);
        when(execution.extractApprovalSteps(root)).thenReturn(List.of(Map.of("nodeKey", "approve", "nodeTitle", "审批")));

        PageResult<WfTask> result = service.getDoneTasks(42L, new PageQuery());

        assertEquals(8, result.getRows().size());
        result.getRows().forEach(task -> {
            assertEquals(1, task.getTotalSteps());
            assertEquals(1, task.getCurrentStepIndex());
            assertEquals("流程结束", task.getNextNodeName());
        });
        verify(resolver).parseRuntimeRoot("model");
        verify(execution).extractApprovalSteps(root);
    }

    @Test
    void malformedSharedDefinitionIsAttemptedOnceAndStillReturnsTasks() {
        when(resolver.parseRuntimeRoot("model")).thenThrow(new IllegalArgumentException("invalid model"));
        PageResult<WfTask> result = service.getDoneTasks(42L, new PageQuery());
        assertEquals(8, result.getRows().size());
        assertTrue(result.getRows().stream().allMatch(task -> "审批".equals(task.getProcessName())));
        verify(resolver).parseRuntimeRoot("model");
    }

    @Test
    void cachedDefinitionPreservesWithdrawalOwnershipAndEffectiveApproval() {
        UserContext.setUserId(42L);
        WfTaskHistory owned = new WfTaskHistory();
        owned.setHistoryId("history-owned");
        owned.setTaskId("task-owned");
        owned.setInstanceId("instance");
        owned.setNodeKey("approve");
        owned.setOperatorId(42L);
        owned.setAction("APPROVE");
        owned.setVariablesChanged("{\"_wf_execution\":{\"sequence\":1,\"executionContext\":null}}");
        WfTaskHistory delegated = new WfTaskHistory();
        delegated.setHistoryId("history-delegated");
        delegated.setTaskId("task-delegated");
        delegated.setInstanceId("instance");
        delegated.setNodeKey("approve");
        delegated.setOperatorId(43L);
        delegated.setOnBehalfOfUserId(42L);
        delegated.setAction("APPROVE");
        delegated.setVariablesChanged("{\"_wf_execution\":{\"sequence\":2,\"executionContext\":null}}");
        List<WfTaskHistory> histories = List.of(owned, delegated);
        when(historyMapper.selectPage(any(), any())).thenReturn(new Page<WfTaskHistory>(1, 10, 2).setRecords(histories));
        when(historyMapper.selectList(any())).thenReturn(histories);
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId("instance");
        instance.setDefinitionId("definition");
        instance.setStatus("RUNNING");
        when(instanceMapper.selectBatchIds(any())).thenReturn(List.of(instance));
        WfNodeConfig root = new WfNodeConfig();
        root.setAllowRollback(true);
        when(resolver.parseRuntimeRoot("model")).thenReturn(root);
        when(execution.findNode(root, "approve")).thenReturn(root);
        when(execution.extractApprovalSteps(root)).thenReturn(List.of(Map.of("nodeKey", "approve", "nodeTitle", "审批")));

        PageResult<WfTask> result = service.getDoneTasks(42L, new PageQuery());

        assertTrue(result.getRows().get(0).getCanWithdraw());
        assertFalse(result.getRows().get(1).getCanWithdraw());
        verify(resolver).parseRuntimeRoot("model");
        verify(execution).extractApprovalSteps(root);
    }
}

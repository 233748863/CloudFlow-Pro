package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
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
        var histories = IntStream.range(0, 8).mapToObj(i -> {
            var history = new WfTaskHistory();
            history.setTaskId("task-" + i);
            history.setInstanceId("instance-" + i);
            history.setNodeKey("approve");
            return history;
        }).toList();
        when(historyMapper.selectPage(any(), any())).thenReturn(new Page<WfTaskHistory>(1, 10, 8).setRecords(histories));
        when(instanceMapper.selectBatchIds(any())).thenReturn(IntStream.range(0, 8).mapToObj(i -> {
            var instance = new WfProcessInstance();
            instance.setInstanceId("instance-" + i);
            instance.setDefinitionId("definition");
            return instance;
        }).toList());
        var definition = new WfProcessDefinition();
        definition.setDefinitionId("definition");
        definition.setProcessName("审批");
        definition.setModelJson("model");
        when(definitionMapper.selectBatchIds(any())).thenReturn(List.of(definition));
    }

    @AfterEach
    void closeMocks() throws Exception {
        mocks.close();
    }

    @Test
    void sharedDefinitionIsParsedOnceAndEveryTaskKeepsStepInformation() {
        var root = new WfNodeConfig();
        when(resolver.parseRuntimeRoot("model")).thenReturn(root);
        when(execution.extractApprovalSteps(root)).thenReturn(List.of(Map.of("nodeKey", "approve", "nodeTitle", "审批")));

        var result = service.getDoneTasks(42L, new PageQuery());

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
        var result = service.getDoneTasks(42L, new PageQuery());
        assertEquals(8, result.getRows().size());
        assertTrue(result.getRows().stream().allMatch(task -> "审批".equals(task.getProcessName())));
        verify(resolver).parseRuntimeRoot("model");
    }
}

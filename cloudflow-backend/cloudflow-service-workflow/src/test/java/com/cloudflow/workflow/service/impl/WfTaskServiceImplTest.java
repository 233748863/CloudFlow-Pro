package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.WfTaskRead;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfTaskReadMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.processor.ApprovalPostProcessor;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.ICountersignService;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.service.ISysNoticeService;
import com.cloudflow.workflow.service.RateLimiterService;
import com.cloudflow.workflow.service.WorkflowAuditService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WfTaskServiceImplTest {

    private static final Long TENANT_ID = 100000L;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Mock
    private RedissonClient redissonClient;
    @Mock
    private RLock lock;
    @Mock
    private WfTaskMapper taskMapper;
    @Mock
    private TaskMonitorMapper taskMonitorMapper;
    @Mock
    private WfTaskHistoryMapper taskHistoryMapper;
    @Mock
    private WfProcessInstanceMapper processInstanceMapper;
    @Mock
    private WfProcessDefinitionMapper processDefinitionMapper;
    @Mock
    private WfTaskReadMapper taskReadMapper;
    @Mock
    private WorkflowPermissionService permissionService;
    @Mock
    private RateLimiterService rateLimiterService;
    @Mock
    private WorkflowAuditService auditService;
    @Mock
    private WorkflowSecurityUtils securityUtils;
    @Mock
    private ISysNoticeService sysNoticeService;
    @Mock
    private ICountersignService countersignService;
    @Mock
    private INodeExecutionService nodeExecutionService;
    @Mock
    private WorkflowEventPublisher workflowEventPublisher;
    @Mock
    private ApprovalPostProcessor approvalPostProcessor;
    @Mock
    private TaskReminderJob taskReminderJob;
    @Mock
    private WorkflowGraphModelResolver workflowGraphModelResolver;

    private WfTaskServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext.setUserId(1L);
        UserContext.setUserName("admin");
        UserContext.setTenantId(TENANT_ID);
        UserContext.setRoles(Set.of("admin"));

        service = new WfTaskServiceImpl();
        inject("redissonClient", redissonClient);
        inject("taskMapper", taskMapper);
        inject("taskMonitorMapper", taskMonitorMapper);
        inject("taskHistoryMapper", taskHistoryMapper);
        inject("processInstanceMapper", processInstanceMapper);
        inject("processDefinitionMapper", processDefinitionMapper);
        inject("taskReadMapper", taskReadMapper);
        inject("permissionService", permissionService);
        inject("rateLimiterService", rateLimiterService);
        inject("auditService", auditService);
        inject("securityUtils", securityUtils);
        inject("sysNoticeService", sysNoticeService);
        inject("countersignService", countersignService);
        inject("nodeExecutionService", nodeExecutionService);
        inject("workflowEventPublisher", workflowEventPublisher);
        inject("approvalPostProcessor", approvalPostProcessor);
        inject("taskReminderJob", taskReminderJob);
        inject("workflowGraphModelResolver", workflowGraphModelResolver);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void readTaskMarksPendingTaskReadForAssignee() {
        WfTask task = task("task-1", "inst-1", 1L);
        when(taskMapper.selectById("task-1")).thenReturn(task);
        when(taskReadMapper.selectCount(any(Wrapper.class))).thenReturn(0L);

        service.readTask("task-1", 1L);

        ArgumentCaptor<WfTaskRead> readCaptor = ArgumentCaptor.forClass(WfTaskRead.class);
        verify(taskReadMapper).insert(readCaptor.capture());
        WfTaskRead read = readCaptor.getValue();
        assertEquals(TENANT_ID, read.getTenantId());
        assertEquals("task-1", read.getTaskId());
        assertEquals(1L, read.getUserId());
    }

    @Test
    void readTaskTreatsCompletedHistoricalTaskAsNoopWhenViewerHasPermission() {
        WfTaskHistory history = history("task-1", "inst-1");
        WfProcessInstance instance = instance("inst-1", "def-1");
        when(taskMapper.selectById("task-1")).thenReturn(null);
        when(taskHistoryMapper.selectOne(any(Wrapper.class))).thenReturn(history);
        when(processInstanceMapper.selectById("inst-1")).thenReturn(instance);

        service.readTask("task-1", 1L);

        verify(permissionService).checkViewInstancePermission(instance);
        verify(taskReadMapper, never()).insert(any(WfTaskRead.class));
    }

    @Test
    void readTaskKeepsTaskNotFoundWhenTaskHasNoHistory() {
        when(taskMapper.selectById("missing-task")).thenReturn(null);
        when(taskHistoryMapper.selectOne(any(Wrapper.class))).thenReturn(null);

        WorkflowException exception = assertThrows(
                WorkflowException.class,
                () -> service.readTask("missing-task", 1L)
        );

        assertEquals("TASK_NOT_FOUND", exception.getCode());
    }

    @Test
    void readTaskRejectsCompletedHistoricalTaskWithoutViewPermission() {
        WfTaskHistory history = history("task-1", "inst-1");
        WfProcessInstance instance = instance("inst-1", "def-1");
        when(taskMapper.selectById("task-1")).thenReturn(null);
        when(taskHistoryMapper.selectOne(any(Wrapper.class))).thenReturn(history);
        when(processInstanceMapper.selectById("inst-1")).thenReturn(instance);
        org.mockito.Mockito.doThrow(new PermissionDeniedException("无权查看此流程实例"))
                .when(permissionService)
                .checkViewInstancePermission(instance);

        assertThrows(PermissionDeniedException.class, () -> service.readTask("task-1", 1L));
        verify(taskReadMapper, never()).insert(any(WfTaskRead.class));
    }

    @Test
    void completeTaskAllowsAdminOverrideAndContinuesGraphFlow() throws Exception {
        WfTask task = task("task-1", "inst-1", 2L);
        task.setNodeKey("gm_approval");
        task.setNodeName("总经理审批");
        task.setAssigneeName("总经理");
        WfProcessInstance instance = instance("inst-1", "def-1");
        WfProcessDefinition definition = definition("def-1");
        WfNodeConfig root = node("root", "START", "开始");
        WfNodeConfig completedNode = node("gm_approval", "APPROVAL", "总经理审批");

        when(redissonClient.getLock("lock:task:task-1")).thenReturn(lock);
        when(lock.tryLock(5, 10, TimeUnit.SECONDS)).thenReturn(true);
        when(lock.isHeldByCurrentThread()).thenReturn(true);
        when(taskMapper.selectById("task-1")).thenReturn(task);
        when(countersignService.isCountersignTask(task)).thenReturn(false);
        when(securityUtils.sanitizeXss("同意")).thenReturn("同意");
        when(permissionService.isAdmin(1L)).thenReturn(true);
        when(processInstanceMapper.selectById("inst-1")).thenReturn(instance);
        when(processDefinitionMapper.selectById("def-1")).thenReturn(definition);
        when(workflowGraphModelResolver.parseRuntimeRoot(definition.getModelJson())).thenReturn(root);
        when(nodeExecutionService.findNode(root, "gm_approval")).thenReturn(completedNode);

        R<?> result = service.completeTask("task-1", "APPROVE", "同意", Map.of(), null);

        assertTrue(result.isSuccess());
        ArgumentCaptor<WfTaskHistory> historyCaptor = ArgumentCaptor.forClass(WfTaskHistory.class);
        verify(taskHistoryMapper).insert(historyCaptor.capture());
        Map<?, ?> metadata = OBJECT_MAPPER.readValue(historyCaptor.getValue().getVariablesChanged(), Map.class);
        assertEquals(true, metadata.get("adminOverride"));
        assertEquals(2, metadata.get("originalAssigneeId"));
        assertEquals("总经理", metadata.get("originalAssigneeName"));
        verify(nodeExecutionService).advanceAfterNode(
                eq(instance),
                eq(completedNode),
                eq("gm_approval"),
                anyMap(),
                eq(0),
                eq(root)
        );
    }

    private void inject(String fieldName, Object value) {
        ReflectionTestUtils.setField(service, fieldName, value);
    }

    private WfTask task(String taskId, String instanceId, Long assignee) {
        WfTask task = new WfTask();
        task.setTaskId(taskId);
        task.setTenantId(TENANT_ID);
        task.setInstanceId(instanceId);
        task.setNodeKey("node-1");
        task.setNodeName("审批");
        task.setAssignee(assignee);
        task.setAssigneeName("审批人");
        task.setStatus("TODO");
        task.setCreateTime(LocalDateTime.now().minusMinutes(5));
        return task;
    }

    private WfTaskHistory history(String taskId, String instanceId) {
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId("history-1");
        history.setTenantId(TENANT_ID);
        history.setTaskId(taskId);
        history.setInstanceId(instanceId);
        history.setNodeKey("node-1");
        history.setNodeName("审批");
        history.setOperatorId(1L);
        history.setCreateTime(LocalDateTime.now());
        return history;
    }

    private WfProcessInstance instance(String instanceId, String definitionId) {
        WfProcessInstance instance = new WfProcessInstance();
        instance.setInstanceId(instanceId);
        instance.setTenantId(TENANT_ID);
        instance.setDefinitionId(definitionId);
        instance.setProcessDefKey("payment");
        instance.setTitle("付款申请");
        instance.setStartUserId(1L);
        instance.setVariables("{}");
        return instance;
    }

    private WfProcessDefinition definition(String definitionId) {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId(definitionId);
        definition.setTenantId(TENANT_ID);
        definition.setProcessKey("payment");
        definition.setModelJson("{\"nodes\":[],\"edges\":[]}");
        return definition;
    }

    private WfNodeConfig node(String id, String type, String title) {
        WfNodeConfig node = new WfNodeConfig();
        node.setId(id);
        node.setType(type);
        node.setTitle(title);
        return node;
    }
}

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.handler.NodeHandlerFactory;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.listener.GlobalListenerDispatcher;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.processor.ApprovalPostProcessor;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.*;
import com.cloudflow.workflow.service.impl.CountersignServiceImpl;
import com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl;
import com.cloudflow.workflow.service.impl.WfTaskServiceImpl;
import com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService;
import com.cloudflow.workflow.service.monitor.impl.ProcessMonitorServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Method;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

public final class WorkflowDatabaseTaskFixture {
    private final SqlSessionTemplate sessions;
    private final List<Object> peripheralEvents = new CopyOnWriteArrayList<>();
    public final WorkflowAddSignService addSigns;
    public final WorkflowDelegationReturnService returns;
    public final IWfTaskService operations;
    public final TaskReminderJob reminders;
    public final WorkflowHistoryState histories;
    public final WorkflowEventPublisher events;

    public WorkflowDatabaseTaskFixture(SqlSessionTemplate sessions, TransactionTemplate transaction, WorkflowAgentService agents,
                                       WorkflowPermissionService permissions, WorkflowNodePolicy nodes,
                                       WorkflowHParticipantPolicy participants, ObjectMapper json) throws Exception {
        this.sessions = sessions;
        WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
        WorkflowSecurityUtils security = new WorkflowSecurityUtils();
        events = new WorkflowEventPublisher(peripheralEvents::add);
        MessageSender messages = peripheralEvents::add;
        histories = new WorkflowHistoryState(mapper(WfProcessInstanceMapper.class));
        WorkflowGatewayService gateways = new WorkflowGatewayService(mapper(WfGatewayActivationMapper.class), mapper(WfParallelJoinMapper.class), json, null);
        reminders = new TaskReminderJob() {
            @Override
            public void cancelReminders(String taskId) { peripheralEvents.add("reminder-closed:" + taskId); }
            @Override
            public void registerAfterCommit(String taskId, Integer slaHours) { peripheralEvents.add("reminder-opened:" + taskId); }
        };
        TimerSchedulerService timers = new TimerSchedulerService(null, null, mapper(WfProcessInstanceMapper.class), transaction) {
            @Override
            public void cancelTimersForInstance(String instanceId) { peripheralEvents.add("timer-closed:" + instanceId); }
        };
        WorkflowTerminalTaskService terminal = new WorkflowTerminalTaskService(mapper(WfProcessInstanceMapper.class), mapper(WfTaskMapper.class),
                mapper(WfTaskAddSignMapper.class), mapper(WfTaskDelegationMapper.class), mapper(WfTaskCandidateMapper.class),
                mapper(WfTaskReadMapper.class), mapper(WfCountersignTaskMapper.class), mapper(TaskMonitorMapper.class), reminders);
        WorkflowProcessStateService states = new WorkflowProcessStateService(mapper(WfProcessInstanceMapper.class), mapper(ProcessMonitorMapper.class),
                timers, mapper(WfGatewayActivationMapper.class), terminal, new WorkflowMeetingLifecyclePublisher(null, json), new com.cloudflow.workflow.service.WorkflowSettlementLifecyclePublisher(null, json));
        returns = new WorkflowDelegationReturnService(mapper(WfTaskMapper.class), mapper(WfTaskDelegationMapper.class),
                mapper(WfTaskHistoryMapper.class), mapper(TaskMonitorMapper.class), mapper(SysUserMapper.class), agents, messages, json);
        addSigns = new WorkflowAddSignService(mapper(WfTaskMapper.class), mapper(WfTaskAddSignMapper.class), mapper(WfCountersignTaskMapper.class),
                mapper(WfProcessInstanceMapper.class), mapper(WfTaskHistoryMapper.class), mapper(WfTaskReadMapper.class), mapper(TaskMonitorMapper.class),
                agents, returns, permissions, nodes, participants, gateways, histories, security, events, reminders, messages);
        CountersignServiceImpl countersigns = new CountersignServiceImpl();
        WorkflowFormAccessService formAccess = new WorkflowFormAccessService(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class),
                mapper(WfFormDefinitionMapper.class), mapper(WfTaskMapper.class), mapper(WfTaskHistoryMapper.class), mapper(WfProcessCopyMapper.class),
                permissions, null, graphs, new WorkflowDraftJson(json), null, null, null);
        ProcessMonitorServiceImpl monitor = new ProcessMonitorServiceImpl(mapper(ProcessMonitorMapper.class), new PerformanceStatsRefreshService(
                mapper(PerformanceStatsMapper.class), mapper(ProcessMonitorMapper.class), mapper(TaskMonitorMapper.class)));
        GlobalListenerDispatcher listeners = new GlobalListenerDispatcher();
        listeners.init();
        NodeExecutionServiceImpl engine = new NodeExecutionServiceImpl();
        inject(engine, "workflowProperties", new WorkflowProperties());
        inject(engine, "taskMapper", mapper(WfTaskMapper.class));
        inject(engine, "taskHistoryMapper", mapper(WfTaskHistoryMapper.class));
        inject(engine, "snapshotMapper", mapper(WfProcessSnapshotMapper.class));
        inject(engine, "processInstanceMapper", mapper(WfProcessInstanceMapper.class));
        inject(engine, "processStateService", states);
        inject(engine, "workflowGraphModelResolver", graphs);
        inject(engine, "hParticipantPolicy", participants);
        inject(engine, "gateways", gateways);
        inject(engine, "nodeHandlerFactory", new NodeHandlerFactory(List.of()));
        inject(engine, "globalListenerDispatcher", listeners);
        inject(engine, "workflowEventPublisher", events);
        inject(engine, "processMonitorService", monitor);
        WorkflowDatabaseTaskFixture.DatabaseTaskService taskService = new DatabaseTaskService(transaction);
        inject(taskService, "taskMapper", mapper(WfTaskMapper.class));
        inject(taskService, "taskHistoryMapper", mapper(WfTaskHistoryMapper.class));
        inject(taskService, "taskReadMapper", mapper(WfTaskReadMapper.class));
        inject(taskService, "taskMonitorMapper", mapper(TaskMonitorMapper.class));
        inject(taskService, "processInstanceMapper", mapper(WfProcessInstanceMapper.class));
        inject(taskService, "processDefinitionMapper", mapper(WfProcessDefinitionMapper.class));
        inject(taskService, "sysUserMapper", mapper(SysUserMapper.class));
        inject(taskService, "permissionService", permissions);
        inject(taskService, "agents", agents);
        inject(taskService, "addSignGroups", addSigns);
        inject(taskService, "delegationReturns", returns);
        inject(taskService, "nodePolicy", nodes);
        inject(taskService, "hParticipantPolicy", participants);
        inject(taskService, "gateways", gateways);
        inject(taskService, "historyState", histories);
        inject(taskService, "processStateService", states);
        inject(taskService, "workflowGraphModelResolver", graphs);
        inject(taskService, "formAccess", formAccess);
        inject(taskService, "securityUtils", security);
        inject(taskService, "nodeExecutionService", engine);
        inject(taskService, "countersignService", countersigns);
        inject(taskService, "taskReminderJob", reminders);
        inject(taskService, "workflowEventPublisher", events);
        inject(taskService, "approvalPostProcessor", new ApprovalPostProcessor());
        inject(taskService, "sysNoticeService", messages);
        inject(taskService, "auditService", new WorkflowAuditService() {
            @Override
            public void log(AuditAction action, String targetId, String detail) { peripheralEvents.add(action + ":" + targetId); }
        });
        ProxyFactory factory = new ProxyFactory(taskService);
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transaction.getTransactionManager(), new AnnotationTransactionAttributeSource()));
        operations = (IWfTaskService) factory.getProxy();
    }

    private <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }

    private static void inject(Object target, String name, Object value) throws Exception {
        for (Class<?> current = target.getClass(); current != null; current = current.getSuperclass()) {
            try {
                Field field = current.getDeclaredField(name);
                field.setAccessible(true);
                field.set(target, value);
                return;
            } catch (NoSuchFieldException ignored) { }
        }
        throw new NoSuchFieldException(name);
    }

    public static class DatabaseTaskService extends WfTaskServiceImpl {
        private final TransactionTemplate transaction;

        public DatabaseTaskService(TransactionTemplate transaction) { this.transaction = transaction; }

        @Override
        public R<?> completeTask(String taskId, String action, String comment, Map<String, Object> variables, String delegateUserId) {
            return transaction.execute(status -> {
                String normalized = (String) invoke("normalizeCompleteAction", new Class<?>[]{String.class}, action);
                return (R<?>) invoke("doCompleteTask", new Class<?>[]{String.class, String.class, String.class, Map.class, String.class, Long.class, String.class},
                        taskId, normalized, comment, variables, delegateUserId, UserContext.getUserId(), null);
            });
        }

        private Object invoke(String name, Class<?>[] types, Object... arguments) {
            try {
                Method method = WfTaskServiceImpl.class.getDeclaredMethod(name, types);
                method.setAccessible(true);
                return method.invoke(this, arguments);
            } catch (InvocationTargetException wrapped) {
                if (wrapped.getCause() instanceof RuntimeException failure) throw failure;
                throw new IllegalStateException(wrapped.getCause());
            } catch (ReflectiveOperationException failure) {
                throw new IllegalStateException(failure);
            }
        }
    }
}

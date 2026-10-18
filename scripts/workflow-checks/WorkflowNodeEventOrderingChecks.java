import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.config.WorkflowEventConfig;
import com.cloudflow.workflow.domain.WfNodeRecord;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.monitor.NodeMonitor;
import com.cloudflow.workflow.event.*;
import com.cloudflow.workflow.mapper.NodeMonitorMapper;
import com.cloudflow.workflow.mapper.WfNodeRecordMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.monitor.IProcessMonitorService;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

/** Real Spring event/transaction dispatch; mapper doubles isolate order from database timing. */
public final class WorkflowNodeEventOrderingChecks {
    private static final ThreadLocal<Records> CURRENT = new ThreadLocal<>();

    @Configuration
    @EnableTransactionManagement
    static class ConfigurationUnderTest { }

    static final class Transactions extends AbstractPlatformTransactionManager {
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) { }
        @Override protected void doCommit(DefaultTransactionStatus status) { }
        @Override protected void doRollback(DefaultTransactionStatus status) { }
    }

    static final class Records {
        final List<WfNodeRecord> nodes = new ArrayList<>();
        final List<NodeMonitor> monitors = new ArrayList<>();
        int writes;
    }

    public static int run() throws Exception {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "node-event-ordering");
        TableInfoHelper.initTableInfo(assistant, WfNodeRecord.class);
        TableInfoHelper.initTableInfo(assistant, NodeMonitor.class);
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            Transactions transactions = new Transactions();
            context.register(ConfigurationUnderTest.class, WorkflowEventConfig.class);
            context.registerBean("transactionManager", Transactions.class, () -> transactions);
            context.registerBean(WfNodeRecordMapper.class, () -> proxy(WfNodeRecordMapper.class, WorkflowNodeEventOrderingChecks::nodeCall));
            context.registerBean(NodeMonitorMapper.class, () -> proxy(NodeMonitorMapper.class, WorkflowNodeEventOrderingChecks::monitorCall));
            context.registerBean(WfProcessInstanceMapper.class, () -> proxy(WfProcessInstanceMapper.class, (method, args) -> {
                WfProcessInstance instance = new WfProcessInstance(); instance.setTenantId(100000L); return instance;
            }));
            context.registerBean(IProcessMonitorService.class, () -> proxy(IProcessMonitorService.class, (method, args) -> null));
            context.registerBean(WorkflowEventListener.class);
            context.refresh();
            TransactionTemplate template = new TransactionTemplate(transactions);
            Records rollback = new Records(); CURRENT.set(rollback);
            try {
                template.executeWithoutResult(status -> {
                    node(context, "end", true); node(context, "end", false);
                    context.publishEvent(new ProcessCompletedEvent(context, "instance", "definition", 1L, "审批人"));
                    status.setRollbackOnly();
                });
                require(rollback.writes == 0, "Rolled back business operation must not dispatch record writes");
            } finally { CURRENT.remove(); }

            CyclicBarrier together = new CyclicBarrier(4);
            ExecutorService workers = Executors.newFixedThreadPool(4);
            try {
                List<Callable<Integer>> jobs = new ArrayList<>();
                for (int worker = 0; worker < 4; worker++) jobs.add(() -> {
                    Records records = new Records(); CURRENT.set(records);
                    try {
                        together.await(10, TimeUnit.SECONDS);
                        for (int iteration = 0; iteration < 8; iteration++) {
                            template.executeWithoutResult(status -> {
                                node(context, "review", true);
                                node(context, "end", true); node(context, "end", false);
                                // Production task completion can follow the process completion publication.
                                context.publishEvent(new ProcessCompletedEvent(context, "instance", "definition", 1L, "审批人"));
                                context.publishEvent(new TaskCompletedEvent(context, "instance", "definition", "task", "review", "审批", 1L, "审批人", "APPROVE", "同意"));
                            });
                        }
                        require(records.nodes.size() == 16, "Repeated visits must retain exactly eight review and eight end records");
                        require(records.monitors.size() == 16, "Repeated node monitors must not duplicate terminal records");
                        require(records.nodes.stream().allMatch(record -> "COMPLETED".equals(record.getStatus()) && record.getEndTime() != null), "All committed records complete before transaction returns");
                        require(records.monitors.stream().allMatch(record -> "COMPLETED".equals(record.getStatus())), "All monitors complete before transaction returns");
                        require(records.nodes.stream().filter(record -> "review".equals(record.getNodeKey())).allMatch(record -> Long.valueOf(1L).equals(record.getExecutorId())), "Late task completion enriches original node instead of creating a second record");
                        require(records.nodes.stream().filter(record -> "end".equals(record.getNodeKey())).count() == 8, "One end per passage across concurrent transactions");
                        return 6;
                    } finally { CURRENT.remove(); }
                });
                int checks = 1;
                for (Future<Integer> result : workers.invokeAll(jobs, 30, TimeUnit.SECONDS)) checks += result.get();
                System.out.println("WORKFLOW_NODE_EVENT_ORDERING: checks=" + checks + "; workers=4; committed_transactions=32; rollback_writes=0; repeated_visits_preserved=true");
                return checks;
            } finally { workers.shutdownNow(); }
        }
    }

    private static void node(AnnotationConfigApplicationContext context, String key, boolean start) {
        String type = "end".equals(key) ? "END" : "APPROVAL";
        context.publishEvent(start ? new NodeStartedEvent(context, "instance", "definition", key, key, type)
                : new NodeCompletedEvent(context, "instance", "definition", key, key, type, 0L));
    }

    private static Object nodeCall(String method, Object[] args) {
        Records records = CURRENT.get();
        if (records == null) throw new AssertionError("Record writes escaped their originating transaction thread");
        if ("insert".equals(method)) { WfNodeRecord record = (WfNodeRecord) args[0]; record.setId((long) records.nodes.size() + 1); records.nodes.add(record); records.writes++; return 1; }
        if ("updateById".equals(method)) { records.writes++; return 1; }
        if ("update".equals(method)) {
            records.nodes.stream().filter(record -> "RUNNING".equals(record.getStatus())).forEach(record -> { record.setStatus("COMPLETED"); record.setEndTime(LocalDateTime.now()); });
            records.writes++; return 1;
        }
        if ("selectPage".equals(method)) {
            Collection<Object> values = parameters(args[1]);
            List<WfNodeRecord> matches = records.nodes.stream().filter(record -> values.contains(record.getNodeKey()) && "RUNNING".equals(record.getStatus())).toList();
            Page<WfNodeRecord> page = new Page<>(); page.setRecords(matches.isEmpty() ? List.of() : List.of(matches.get(matches.size() - 1))); return page;
        }
        throw new AssertionError("Unexpected node mapper method: " + method);
    }

    private static Object monitorCall(String method, Object[] args) {
        Records records = CURRENT.get();
        if (records == null) throw new AssertionError("Monitor writes escaped their originating transaction thread");
        if ("insert".equals(method)) { NodeMonitor monitor = (NodeMonitor) args[0]; records.monitors.add(monitor); return 1; }
        if ("updateById".equals(method)) return 1;
        if ("selectList".equals(method)) return records.monitors.stream().filter(record -> "RUNNING".equals(record.getStatus())).toList();
        if ("selectPage".equals(method)) {
            Collection<Object> values = parameters(args[1]);
            List<NodeMonitor> matches = records.monitors.stream().filter(record -> values.contains(record.getNodeKey()) && "RUNNING".equals(record.getStatus())).toList();
            Page<NodeMonitor> page = new Page<>(); page.setRecords(matches.isEmpty() ? List.of() : List.of(matches.get(matches.size() - 1))); return page;
        }
        throw new AssertionError("Unexpected monitor mapper method: " + method);
    }

    private static Collection<Object> parameters(Object argument) {
        AbstractWrapper<?, ?, ?> wrapper = (AbstractWrapper<?, ?, ?>) argument;
        wrapper.getSqlSegment(); return wrapper.getParamNameValuePairs().values();
    }

    private static <T> T proxy(Class<T> type, BiFunction<String, Object[], Object> call) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, args) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) {
                case "toString" -> type.getSimpleName(); case "hashCode" -> System.identityHashCode(instance); case "equals" -> instance == args[0]; default -> null;
            };
            return call.apply(method.getName(), args);
        }));
    }

    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
}

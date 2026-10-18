import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.workflow.domain.monitor.ProcessMonitor;
import com.cloudflow.workflow.mapper.ProcessMonitorMapper;
import com.cloudflow.workflow.mapper.TimeoutAlertMapper;
import com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService;
import com.cloudflow.workflow.service.monitor.impl.TimeoutDetectionServiceImpl;
import com.cloudflow.workflow.service.INotificationService;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Constructor;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Bounded regression: transaction isolation, rollback, continuation and truthful job failure. */
public class TimeoutProcessTransactionChecks {
    private static int checks;
    private static final List<Long> refreshed = new ArrayList<>();
    private static final List<Long> inserted = new ArrayList<>();
    private static long failingId = -1;
    private static long completedId = -1;

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static ProcessMonitor process(long id, long tenant) {
        ProcessMonitor process = new ProcessMonitor();
        process.setId(id); process.setTenantId(tenant); process.setInstanceId("owned-" + id);
        process.setProcessDefKey("owned-timeout"); process.setProcessDefName("Owned timeout");
        process.setStartTime(LocalDateTime.now().minusDays(5));
        process.setStartUserId(100L + tenant);
        process.setStatus(id == completedId ? "PASSED" : "RUNNING");
        return process;
    }

    private static final class Transactions extends AbstractPlatformTransactionManager {
        int commits;
        int rollbacks;
        @Override protected Object doGetTransaction() { return new Object(); }
        @Override protected void doBegin(Object transaction, TransactionDefinition definition) {
            check(definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW, "each process requires a new transaction");
            check(definition.getIsolationLevel() == TransactionDefinition.ISOLATION_READ_COMMITTED, "scan uses committed snapshots");
        }
        @Override protected void doCommit(DefaultTransactionStatus status) { commits++; }
        @Override protected void doRollback(DefaultTransactionStatus status) { rollbacks++; }
    }

    @SuppressWarnings("unchecked")
    public static void main(String[] args) throws Exception {
        Transactions manager = new Transactions();
        ProcessMonitorMapper processes = (ProcessMonitorMapper) Proxy.newProxyInstance(ProcessMonitorMapper.class.getClassLoader(), new Class<?>[]{ProcessMonitorMapper.class}, (proxy, method, values) -> {
            if (method.getName().equals("selectRunningProcesses")) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "tenant enumeration must not hold transaction locks");
                long tenant = (Long) values[0];
                check(Long.valueOf(tenant).equals(TenantContext.getTenantId()), "tenant context matches query");
                return tenant == 10 ? List.of(process(1, tenant), process(2, tenant)) : List.of(process(3, tenant));
            }
            if (method.getName().equals("lockForAnomalyScan")) {
                check(TransactionSynchronizationManager.isActualTransactionActive(), "monitor is locked inside item transaction");
                long id = (Long) values[1];
                if (id == failingId) throw new IllegalStateException("OWNED_DATABASE_FAILURE");
                return process(id, (Long) values[0]);
            }
            throw new AssertionError(method.getName());
        });
        TimeoutAlertMapper alerts = (TimeoutAlertMapper) Proxy.newProxyInstance(TimeoutAlertMapper.class.getClassLoader(), new Class<?>[]{TimeoutAlertMapper.class}, (proxy, method, values) -> {
            if (method.getName().equals("selectList")) return List.of();
            if (method.getName().equals("insert")) { inserted.add(TenantContext.getTenantId()); return 1; }
            if (method.getName().equals("updateById")) return 1;
            throw new AssertionError(method.getName());
        });
        PerformanceStatsRefreshService statistics = new PerformanceStatsRefreshService(null, null, null) {
            @Override public void lockAnomalyScanBucket(ProcessMonitor process) {
                check(Integer.valueOf(TransactionDefinition.ISOLATION_READ_COMMITTED).equals(TransactionSynchronizationManager.getCurrentTransactionIsolationLevel()), "bucket lock shares item isolation");
            }
            @Override public void refreshForProcess(ProcessMonitor process) { refreshed.add(process.getId()); }
        };
        RuntimeSysConfigService config = new RuntimeSysConfigService(null) {
            @Override public long getLong(String key, long fallback) { return fallback; }
        };
        TenantIterator tenants = new TenantIterator(null) {
            @Override public List<Long> listActiveTenantIds() { return List.of(10L, 20L); }
        };
        INotificationService notifications = (INotificationService) Proxy.newProxyInstance(INotificationService.class.getClassLoader(), new Class<?>[]{INotificationService.class}, (proxy, method, values) -> {
            check(TransactionSynchronizationManager.isActualTransactionActive(), "notification registration shares transaction");
            return null;
        });
        Map<Class<?>, Object> dependencies = Map.of(ProcessMonitorMapper.class, processes, TimeoutAlertMapper.class, alerts,
                PerformanceStatsRefreshService.class, statistics, RuntimeSysConfigService.class, config,
                TenantIterator.class, tenants, TransactionTemplate.class, new TransactionTemplate(manager), INotificationService.class, notifications);
        Constructor<?> constructor = TimeoutDetectionServiceImpl.class.getConstructors()[0];
        Object[] values = new Object[constructor.getParameterCount()];
        Class<?>[] types = constructor.getParameterTypes();
        for (int index = 0; index < types.length; index++) values[index] = dependencies.get(types[index]);
        TimeoutDetectionServiceImpl service = (TimeoutDetectionServiceImpl) constructor.newInstance(values);
        service.detectTimeoutProcesses();
        check(manager.commits == 3 && manager.rollbacks == 0, "normal scan commits one transaction per process");
        check(refreshed.equals(List.of(1L, 2L, 3L)), "all statistics refreshed");
        check(inserted.equals(List.of(10L, 10L, 20L)), "alerts keep tenant ownership");
        refreshed.clear(); inserted.clear(); failingId = 1; completedId = 2;
        try { service.detectTimeoutProcesses(); throw new AssertionError("partial failure must fail the job"); }
        catch (IllegalStateException failure) { check(failure.getSuppressed().length == 1, "job reports failed item"); }
        check(manager.commits == 5 && manager.rollbacks == 1, "failed process rolls back and remaining items commit");
        check(refreshed.equals(List.of(3L)) && inserted.equals(List.of(20L)), "completed process skipped; later tenant continues");
        check(TenantContext.getTenantId() == null && !TransactionSynchronizationManager.isActualTransactionActive(), "context and transaction restored");
        System.out.println("PASS timeout_process_transaction_checks=" + checks);
    }
}

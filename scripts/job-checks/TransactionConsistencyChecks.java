package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import com.cloudflow.workflow.mapper.WfTransactionMessageMapper;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.time.LocalDateTime;
import java.util.function.Supplier;
import java.util.concurrent.TimeUnit;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

/** Production service; controlled lock and mapper failures, no actual database or message delivery. */
public final class TransactionConsistencyChecks {
    private static int passed;
    private static final List<String> failures = new ArrayList<>();

    public static void main(String[] args) throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "transaction-checks"), WfTransactionMessage.class);
        try {
            caseOf("contended-retry-keeps-owner-lock", TransactionConsistencyChecks::contendedRetry);
            caseOf("scan-query-failure-propagates", () -> discoveryFailure("retryPendingMessages", "selectPage"));
            caseOf("cleanup-database-failure-propagates", () -> discoveryFailure("cleanupSuccessMessages", "delete"));
            caseOf("task-counts-and-cleanup-filter", TransactionConsistencyChecks::counts);
            caseOf("lock-skip-interruption-and-owner-release", TransactionConsistencyChecks::lockBoundaries);
            caseOf("paged-scan-counts-and-partial-failure", TransactionConsistencyChecks::paging);
            caseOf("unsupported-message-retention-and-stale-read", TransactionConsistencyChecks::unsupported);
            check(TenantContext.getTenantId() == null && UserContext.getTenantId() == null, "tenant contexts restored");
            System.out.println("TXN_CONSISTENCY_CHECKS: passed=" + passed + "; failed=" + failures.size()
                    + "; production_service=true; controlled_locks_and_mappers=true; actual_database=false");
            if (!failures.isEmpty()) throw new AssertionError("Transaction checks failed: " + String.join(",", failures));
        } finally { TenantContext.clear(); UserContext.clear(); }
    }

    private static void contendedRetry() throws Exception {
        Fixture fixture = new Fixture(false);
        WfTransactionMessage message = new WfTransactionMessage();
        message.setTenantId(10L); message.setMessageId("owned-competitor"); message.setBusinessType("NOTIFICATION");
        message.setStatus("PENDING"); message.setRetryCount(0); message.setMaxRetryCount(5);
        TenantBroker.runAs(10L, ignored -> invoke(fixture.service, "doRetryMessage", new Class<?>[]{WfTransactionMessage.class}, message));
        check(fixture.deleted == 0 && fixture.unlocked == 0 && fixture.mapperCalls == 0, "contender must not release another owner or write message state");
    }

    private static void discoveryFailure(String method, String mapperMethod) throws Exception {
        Fixture fixture = new Fixture(true);
        RuntimeException original = new IllegalStateException("controlled-" + mapperMethod + "-failure");
        fixture.mapperFailure = original;
        Throwable observed = null;
        try { invoke(fixture.service, method, new Class<?>[0]); } catch (RuntimeException failure) { observed = failure; }
        check(contains(observed, original), "task exposes original database failure");
        check(fixture.unlocked == 1, "owned scan lock released after failure");
    }

    private static void counts() throws Exception {
        Fixture fixture = new Fixture(true);
        fixture.behavior = (target, method, args) -> {
            check(TenantContext.getTenantSkip(), "explicit platform scope");
            if (method.getName().equals("selectRetryCandidates")) return List.of();
            LambdaQueryWrapper<?> query = (LambdaQueryWrapper<?>) args[0];
            String sql = query.getSqlSegment();
            check(sql.contains("status") && sql.contains("update_time") && sql.contains("<"), "strict cleanup cutoff");
            check(query.getParamNameValuePairs().containsValue("SUCCESS"), "successful messages only");
            LocalDateTime cutoff = (LocalDateTime) query.getParamNameValuePairs().values().stream().filter(LocalDateTime.class::isInstance).findFirst().orElseThrow();
            check(cutoff.isAfter(LocalDateTime.now().minusDays(7).minusSeconds(5)) && cutoff.isBefore(LocalDateTime.now().minusDays(7).plusSeconds(1)), "seven day retention");
            return 7;
        };
        JobResult empty = fixture.service.retryPendingMessages();
        check("SUCCESS".equals(empty.getExecuteStatus()) && empty.getAffectedRows() == 0, "empty scan zero");
        JobResult clean = fixture.service.cleanupSuccessMessages();
        check("SUCCESS".equals(clean.getExecuteStatus()) && clean.getAffectedRows() == 7, "actual cleanup count");
        check(fixture.renewable == 2 && fixture.unlocked == 2, "renewable locks released");
    }

    private static void lockBoundaries() throws Exception {
        for (String task : List.of("retryPendingMessages", "cleanupSuccessMessages")) {
            Fixture skip = new Fixture(false);
            JobResult result = (JobResult) invoke(skip.service, task, new Class<?>[0]);
            check("SKIPPED".equals(result.getExecuteStatus()) && result.getAffectedRows() == 0 && skip.mapperCalls == 0 && skip.unlocked == 0, "busy task skipped");
            Fixture interrupted = new Fixture(true); interrupted.interrupt = true;
            try {
                Throwable failure = failureOf(() -> invoke(interrupted.service, task, new Class<?>[0]));
                check(failure != null && Thread.currentThread().isInterrupted() && interrupted.unlocked == 0, "interruption preserved");
            } finally { Thread.interrupted(); }
            Fixture lost = new Fixture(true); lost.held = false;
            lost.behavior = (target, method, args) -> method.getName().equals("delete") ? 0 : List.of();
            invoke(lost.service, task, new Class<?>[0]);
            check(lost.unlocked == 0, "successor lock retained");
        }
    }

    private static void paging() throws Exception {
        Fixture fixture = new Fixture(true);
        List<WfTransactionMessage> rows = new ArrayList<>();
        List<String> visited = new ArrayList<>();
        List<LocalDateTime> observations = new ArrayList<>();
        boolean[] injected = {false};
        RuntimeException databaseFailure = new IllegalStateException("controlled message lookup failure");
        for (int index = 0; index < 201; index++) rows.add(message("item-%03d".formatted(index), index % 2 == 0 ? 10L : 20L, WorkflowTriggerService.BUSINESS_TYPE));
        java.lang.reflect.Constructor<?> constructor = WorkflowTriggerService.class.getConstructors()[0];
        WorkflowTriggerService trigger = (WorkflowTriggerService) constructor.newInstance(new Object[constructor.getParameterCount()]);
        Field locks = TransactionConsistencyService.class.getDeclaredField("redissonClient"); locks.setAccessible(true);
        Field tx = TransactionConsistencyService.class.getDeclaredField("transactions"); tx.setAccessible(true);
        set(trigger, "redisson", locks.get(fixture.service));
        set(trigger, "transactions", tx.get(fixture.service));
        set(trigger, "instances", proxy(com.cloudflow.workflow.mapper.WfProcessInstanceMapper.class, (target, method, args) -> null));
        set(trigger, "messages", proxy(WfTransactionMessageMapper.class, (target, method, args) -> {
            if (method.getName().equals("selectById")) {
                if (injected[0] && args[0].equals(rows.get(0).getMessageId())) throw databaseFailure;
                WfTransactionMessage row = rows.stream().filter(item -> item.getMessageId().equals(args[0])).findFirst().orElseThrow();
                check(Objects.equals(TenantContext.getTenantId(), row.getTenantId()) && Objects.equals(UserContext.getTenantId(), row.getTenantId()), "exact retry tenant");
                return row;
            }
            visited.add(((WfTransactionMessage) args[0]).getMessageId());
            return 1;
        }));
        set(fixture.service, "triggerService", proxy(ObjectProvider.class, (target, method, args) -> trigger));
        fixture.behavior = (target, method, args) -> {
            observations.add((LocalDateTime) args[1]);
            return rows.stream().filter(row -> row.getStatus().equals("PENDING") && row.getMessageId().compareTo((String) args[0]) > 0).limit((Integer) args[2]).toList();
        };
        JobResult result = fixture.service.retryPendingMessages();
        check(result.getAffectedRows() == 201 && visited.size() == 201, "three pages counted once");
        check(fixture.mapperCalls == 3 && observations.stream().distinct().count() == 1, "one cutoff for entire scan");
        check(rows.stream().allMatch(row -> row.getStatus().equals("SUCCESS")), "missing instances closed by actual trigger service");
        for (WfTransactionMessage row : rows) row.setStatus("PENDING");
        injected[0] = true; visited.clear();
        Throwable failed = failureOf(fixture.service::retryPendingMessages);
        check(contains(failed, databaseFailure) && visited.size() == 200, "failure continues through later messages and tenants");
        check(rows.get(0).getStatus().equals("PENDING"), "failed source retained");
        injected[0] = false;
        check(fixture.service.retryPendingMessages().getAffectedRows() == 1, "recovery only processes retained source");
        check(fixture.service.retryPendingMessages().getAffectedRows() == 0, "repeat has no new work");
    }

    private static void unsupported() throws Exception {
        for (String type : List.of("PROCESS_START", "TASK_COMPLETE", "NOTIFICATION", "SNAPSHOT", "UNREGISTERED")) {
            Fixture fixture = new Fixture(true);
            WfTransactionMessage current = message("unsupported", 10L, type);
            fixture.behavior = (target, method, args) -> {
                if (method.getName().equals("selectForRetry")) return current;
                if (method.getName().equals("updateById")) return 1;
                throw new AssertionError("Unexpected operation");
            };
            Throwable failure = failureOf(() -> TenantBroker.applyAs(10L, ignored -> invoke(fixture.service, "doRetryMessage", new Class<?>[]{WfTransactionMessage.class}, current)));
            check(failure != null && current.getRetryCount() == 1 && current.getStatus().equals("PENDING"), "unsupported action retained");
            check(current.getNextRetryTime().isAfter(LocalDateTime.now().plusSeconds(55)) && fixture.commits == 1, "retry schedule committed");
            current.setRetryCount(4); current.setNextRetryTime(LocalDateTime.now().minusMinutes(1));
            failureOf(() -> TenantBroker.applyAs(10L, ignored -> invoke(fixture.service, "doRetryMessage", new Class<?>[]{WfTransactionMessage.class}, current)));
            check(current.getStatus().equals("FAILED") && current.getRetryCount() == 5, "saved retry limit respected");
            int commits = fixture.commits;
            Object duplicate = TenantBroker.applyAs(10L, ignored -> invoke(fixture.service, "doRetryMessage", new Class<?>[]{WfTransactionMessage.class}, current));
            check(Boolean.FALSE.equals(duplicate) && current.getRetryCount() == 5 && fixture.commits == commits + 1, "terminal message not repeated");
        }
    }

    private static WfTransactionMessage message(String id, Long tenant, String type) {
        WfTransactionMessage row = new WfTransactionMessage();
        row.setMessageId(id); row.setTenantId(tenant); row.setBusinessType(type);
        row.setStatus("PENDING"); row.setRetryCount(0); row.setMaxRetryCount(5);
        row.setNextRetryTime(LocalDateTime.now().minusMinutes(1)); row.setVersion(0);
        return row;
    }

    private static Throwable failureOf(Supplier<?> action) {
        try { action.get(); return null; } catch (RuntimeException failure) { return failure; }
    }

    private static final class Fixture {
        private final TransactionConsistencyService service = new TransactionConsistencyService();
        private int deleted, unlocked, mapperCalls, renewable, commits, rollbacks;
        private boolean interrupt, held = true;
        private RuntimeException mapperFailure;
        private InvocationHandler behavior;
        private Fixture(boolean acquired) throws Exception {
            RLock lock = proxy(RLock.class, (target, method, values) -> {
                if (method.getName().equals("tryLock")) {
                    if (values.length == 2) renewable++;
                    if (interrupt) throw new InterruptedException("controlled-interruption");
                    return acquired;
                }
                if (method.getName().equals("isHeldByCurrentThread")) return acquired && held;
                if (method.getName().equals("unlock")) { unlocked++; return null; }
                throw new AssertionError("Unexpected lock call: " + method.getName());
            });
            set(service, "redissonClient", proxy(RedissonClient.class, (target, method, values) -> {
                if (method.getName().equals("getLock")) return lock;
                throw new AssertionError("Unexpected client call");
            }));
            set(service, "redisCache", new RedisCache() {
                @Override public <T> boolean setCacheObjectIfAbsent(String key, T value, long timeout, TimeUnit unit) { return acquired; }
                @Override public boolean deleteObject(String key) { deleted++; return true; }
            });
            set(service, "sysConfigHelper", new SysConfigHelper() {
                @Override public int getConfigInt(String key, int fallback) { return fallback; }
            });
            set(service, "messageMapper", proxy(WfTransactionMessageMapper.class, (target, method, values) -> {
                mapperCalls++;
                if (mapperFailure != null) throw mapperFailure;
                if (behavior != null) return behavior.invoke(target, method, values);
                throw new AssertionError("Unexpected mapper access: " + method.getName());
            }));
            PlatformTransactionManager manager = proxy(PlatformTransactionManager.class, (target, method, values) -> {
                if (method.getName().equals("getTransaction")) return new SimpleTransactionStatus();
                if (method.getName().equals("commit")) { commits++; return null; }
                if (method.getName().equals("rollback")) { rollbacks++; return null; }
                throw new AssertionError("Unexpected transaction call");
            });
            set(service, "transactions", new TransactionTemplate(manager));
        }
    }

    private interface Checked { void run() throws Exception; }
    private static void caseOf(String name, Checked action) {
        try { action.run(); System.out.println("TXN_CONSISTENCY_CASE: " + name + "; passed=true"); }
        catch (Throwable failure) { failures.add(name); System.out.println("TXN_CONSISTENCY_CASE: " + name + "; passed=false; kind=" + failure.getClass().getSimpleName()); }
    }
    private static void check(boolean condition, String description) { if (!condition) throw new AssertionError(description); passed++; }
    private static boolean contains(Throwable error, Throwable expected) {
        if (error == null) return false;
        if (error == expected || contains(error.getCause(), expected)) return true;
        for (Throwable suppressed : error.getSuppressed()) if (contains(suppressed, expected)) return true;
        return false;
    }
    private static Object invoke(Object target, String name, Class<?>[] types, Object... args) {
        try { Method method = target.getClass().getDeclaredMethod(name, types); method.setAccessible(true); return method.invoke(target, args); }
        catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) throw runtime;
            if (failure.getCause() instanceof Error error) throw error;
            throw new IllegalStateException(failure.getCause());
        } catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
    }
    private static void set(Object target, String name, Object value) throws Exception { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
}

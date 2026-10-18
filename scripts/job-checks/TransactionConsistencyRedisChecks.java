package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import com.cloudflow.workflow.mapper.WfTransactionMessageMapper;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.redisson.Redisson;
import org.redisson.api.NameMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

/** Actual service and two real Redis clients; isolated key names, controlled mapper/transactions. */
public final class TransactionConsistencyRedisChecks {
    private static int checks;
    private static final String SCAN = "lock:scheduled:retryPendingMessages";
    private static final String CLEAN = "lock:scheduled:cleanupSuccessMessages";

    public static void main(String[] args) throws Exception {
        Path run = Path.of(args[0]).toRealPath();
        if (!run.getParent().equals(Path.of("D:/CloudFlowPro/.cloudflow-runtime/batch-g-integration").toRealPath())
                || !run.getFileName().toString().matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Owned fixture required");
        Path configPath = Path.of(args[1]).toRealPath();
        if (!configPath.getParent().equals(run)) throw new IllegalArgumentException("Owned Redis configuration required");
        List<String> lines = Files.readAllLines(configPath);
        if (!lines.contains("bind 127.0.0.1")) throw new IllegalArgumentException("Loopback Redis required");
        String port = lines.stream().filter(line -> line.startsWith("port ")).findFirst().orElseThrow().substring(5).trim();
        String password = lines.stream().filter(line -> line.startsWith("requirepass ")).findFirst().orElseThrow().substring(12).trim();
        if (!port.matches("[0-9]{4,5}") || password.isBlank()) throw new IllegalArgumentException("Owned Redis parameters invalid");
        String prefix = "a3:transaction-check:" + UUID.randomUUID() + ":";
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "real-redis-checks"), WfTransactionMessage.class);
        RedissonClient first = client(port, password, prefix);
        RedissonClient second = null;
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try {
            second = client(port, password, prefix);
            AtomicInteger accesses = new AtomicInteger();
            TransactionConsistencyService service = service(first, (target, method, values) -> {
                accesses.incrementAndGet();
                return method.getName().equals("delete") ? 3 : List.of();
            });
            for (String name : List.of(SCAN, CLEAN)) {
                RLock owner = second.getLock(name);
                owner.lock();
                try {
                    int before = accesses.get();
                    JobResult skipped = name.equals(SCAN) ? service.retryPendingMessages() : service.cleanupSuccessMessages();
                    check("SKIPPED".equals(skipped.getExecuteStatus()) && skipped.getAffectedRows() == 0 && accesses.get() == before, "contended task skips without mapper access");
                    check(owner.isHeldByCurrentThread(), "contender preserves actual other-client owner");
                } finally { owner.unlock(); }
                JobResult recovered = name.equals(SCAN) ? service.retryPendingMessages() : service.cleanupSuccessMessages();
                check("SUCCESS".equals(recovered.getExecuteStatus()) && recovered.getAffectedRows() == (name.equals(SCAN) ? 0 : 3), "task recovers after owner release");
                check(!owner.isLocked(), "completed service releases actual lock");
            }
            WfTransactionMessage message = new WfTransactionMessage();
            message.setTenantId(100000L); message.setMessageId("owned-message"); message.setBusinessType("UNSUPPORTED");
            message.setStatus("PENDING"); message.setRetryCount(0); message.setMaxRetryCount(1);
            message.setNextRetryTime(LocalDateTime.now().minusMinutes(1));
            String messageLock = "lock:txn:retry:" + message.getMessageId();
            RLock held = second.getLock(messageLock);
            held.lock();
            try {
                int before = accesses.get();
                service.retryMessage(message);
                check(accesses.get() == before && held.isHeldByCurrentThread(), "single-message contender cannot write or release owner");
            } finally { held.unlock(); }
            renewal(first, second, executor, SCAN);
            renewal(first, second, executor, CLEAN);
            CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
            AtomicInteger updates = new AtomicInteger();
            InvocationHandler mapper = (target, method, values) -> {
                if (method.getName().equals("selectForRetry")) { entered.countDown(); await(release); return message; }
                if (method.getName().equals("updateById")) { updates.incrementAndGet(); return 1; }
                throw new AssertionError("Unexpected mapper method");
            };
            TransactionConsistencyService worker = service(first, mapper), contender = service(second, mapper);
            Future<Boolean> attempt = executor.submit(() -> {
                try { worker.retryMessage(message); return false; }
                catch (IllegalStateException failure) { return failure.getMessage().equals("事务消息类型没有可执行的补偿处理器"); }
            });
            try {
                check(entered.await(10, TimeUnit.SECONDS), "first message worker entered");
                contender.retryMessage(message);
                check(updates.get() == 0 && second.getLock(messageLock).isLocked(), "second client skips in-flight message");
            } finally { release.countDown(); }
            check(attempt.get(15, TimeUnit.SECONDS) && updates.get() == 1 && message.getRetryCount() == 1, "concurrent message updates exactly once and preserves failure");
            check(!second.getLock(messageLock).isLocked(), "failed message releases own lock");
            for (String name : List.of(SCAN, CLEAN, messageLock)) check(second.getKeys().countExists(name) == 0, "owned lock fully removed");
            check(TenantContext.getTenantId() == null && UserContext.getTenantId() == null, "tenant scope restored after checks");
            System.out.println("TXN_CONSISTENCY_REDIS: checks=" + checks + "; failed=0; actual_redis=true; clients=2; production_service=true; controlled_mapper_transactions=true; isolated_names=true; watchdog_ms=3000; observed_hold_ms=7000; database_access=false; owned_locks_removed=true");
        } finally {
            executor.shutdownNow(); executor.awaitTermination(15, TimeUnit.SECONDS);
            if (second != null) second.shutdown();
            first.shutdown();
        }
    }

    private static void renewal(RedissonClient first, RedissonClient second, ExecutorService executor, String name) throws Exception {
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        boolean cleanup = name.equals(CLEAN);
        TransactionConsistencyService worker = service(first, (target, method, values) -> {
            entered.countDown(); await(release); return cleanup ? 0 : List.of();
        });
        Supplier<JobResult> action = cleanup ? worker::cleanupSuccessMessages : worker::retryPendingMessages;
        Future<JobResult> running = executor.submit(action::get);
        RLock other = second.getLock(name);
        try {
            check(entered.await(10, TimeUnit.SECONDS), "service acquired actual renewable lock");
            Thread.sleep(7000);
            boolean acquired = other.tryLock(0, TimeUnit.SECONDS);
            try { check(!acquired && other.remainTimeToLive() > 0, "watchdog retains owner beyond initial expiration"); }
            finally { if (acquired) other.unlock(); }
        } finally { release.countDown(); }
        check("SUCCESS".equals(running.get(15, TimeUnit.SECONDS).getExecuteStatus()) && !other.isLocked(), "renewed lock released after service completion");
    }

    private static RedissonClient client(String port, String password, String prefix) {
        Config config = new Config();
        config.setThreads(2); config.setNettyThreads(2); config.setLockWatchdogTimeout(3000);
        config.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4).setSubscriptionConnectionMinimumIdleSize(1)
                .setSubscriptionConnectionPoolSize(2).setNameMapper(new NameMapper() {
                    @Override public String map(String name) { return prefix + name; }
                    @Override public String unmap(String name) { return name.startsWith(prefix) ? name.substring(prefix.length()) : name; }
                });
        return Redisson.create(config);
    }

    private static TransactionConsistencyService service(RedissonClient client, InvocationHandler mapper) throws Exception {
        TransactionConsistencyService service = new TransactionConsistencyService();
        set(service, "redissonClient", client);
        set(service, "messageMapper", proxy(WfTransactionMessageMapper.class, mapper));
        PlatformTransactionManager manager = proxy(PlatformTransactionManager.class, (target, method, values) -> {
            if (method.getName().equals("getTransaction")) return new SimpleTransactionStatus();
            if (method.getName().equals("commit") || method.getName().equals("rollback")) return null;
            throw new AssertionError("Unexpected transaction method");
        });
        set(service, "transactions", new TransactionTemplate(manager));
        return service;
    }
    private static void await(CountDownLatch latch) throws InterruptedException { if (!latch.await(25, TimeUnit.SECONDS)) throw new AssertionError("Controlled mapper wait expired"); }
    private static void check(boolean value, String label) { if (!value) throw new AssertionError(label); checks++; }
    private static void set(Object target, String name, Object value) throws Exception { Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value); }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
}

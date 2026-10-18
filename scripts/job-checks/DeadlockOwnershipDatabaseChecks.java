package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.RedisConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.redisson.api.RScript;
import org.redisson.api.RBucket;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.lang.reflect.InvocationTargetException;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Set;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;

/** Real Redis/Redisson, MySQL mapper and message registration; isolated schema and exclusive keys. */
public final class DeadlockOwnershipDatabaseChecks {
    private static int checks;
    private static int defects;
    private static final String TAG = UUID.randomUUID().toString().replace("-", "");
    private static final long TENANT = 8000000000L + Integer.toUnsignedLong(TAG.hashCode());
    private static final List<String> KEYS = new ArrayList<>();
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static JdbcTemplate jdbc;
    private static RedisCache cache;
    private static StringRedisTemplate raw;
    private static RedissonClient first;
    private static RedissonClient second;
    private static SysUserMapper users;
    private static MessageSender sender;
    private static TransactionTemplate transactions;

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Owned JDBC, datadir and root required");
        if (!args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.*")) throw new IllegalArgumentException("Owned loopback database required");
        String schema = "a3_lock_" + TAG.substring(0, 12);
        boolean created = false;
        try (Connection owner = DriverManager.getConnection(args[0], "root", ""); Statement statement = owner.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT @@datadir")) {
                check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()), "owned database datadir");
            }
            try {
                statement.execute("CREATE DATABASE %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci".formatted(schema));
                created = true;
                DriverManagerDataSource source = new DriverManagerDataSource(args[0].replace("/cloud_flow_db?", "/" + schema + "?"), "root", "");
                jdbc = new JdbcTemplate(source);
                for (String table : List.of("sys_user", "sys_role", "sys_user_role", "outbox_event")) {
                    jdbc.execute("CREATE TABLE %s LIKE cloud_flow_db.%s".formatted(table, table));
                }
                transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
                transactions.setTimeout(20);
                MybatisConfiguration configuration = new MybatisConfiguration();
                configuration.setMapUnderscoreToCamelCase(true);
                configuration.setCacheEnabled(false);
                configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
                configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
                configuration.addMapper(SysUserMapper.class);
                configuration.addMapper(OutboxEventMapper.class);
                GlobalConfig global = new GlobalConfig();
                global.setBanner(false);
                global.setDbConfig(new GlobalConfig.DbConfig());
                MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
                factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
                Path root = Path.of(args[2]);
                factory.setMapperLocations(new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/system/SysUserMapper.xml")),
                        new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-common/cloudflow-common-event/src/main/resources/mapper/OutboxEventMapper.xml")));
                SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
                users = sessions.getMapper(SysUserMapper.class);
                StandardEnvironment environment = new StandardEnvironment();
                environment.getPropertySources().addFirst(new MapPropertySource("owned-lock-check", Map.of(
                        "spring.application.name", "cloudflow-service-workflow", "cloudflow.message.secret-key", UUID.randomUUID().toString())));
                sender = new MessageAutoConfiguration().messageSender(new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), JSON), JSON, environment);
                jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (91,?,'Owned administrators','admin',1,'0',0)", TENANT);
                for (long user : List.of(91L, 92L)) {
                    jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted) VALUES (?,?,?,?,'0',0)", user, TENANT, "owned" + user, "Owned admin");
                    jdbc.update("INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES (?,?,91)", TENANT, user);
                }
                TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT);
                first = client(); second = client();
                cache = new RedisCache();
                cache.redisTemplate = new RedisConfig().redisTemplate(new RedissonConnectionFactory(first));
                raw = new StringRedisTemplate(new RedissonConnectionFactory(first));
                check(!first.getId().equals(second.getId()), "two independent real Redisson clients");
                businessTransactions();
                jdbc.execute("DELETE FROM outbox_event");
                precommitRecovery();
                for (String boundary : List.of("prepare-before", "prepare-after", "release-before", "release-after", "cleanup-before", "waiter-before", "waiter-after", "commit-before", "commit-after")) recoveryBoundary(boundary);
                for (String state : List.of("stale", "cancel-before", "cancel-after", "generation", "no-admin", "partial", "corrupt")) recoveryChangedState(state);
                recoveryEventCommit();
                databaseRollback(); changedOwner(); duringNotice(); sameOwnerNewGeneration(); expiredSameOwner(); reentrancy(); waitingClient(); finiteLeases();
                for (String mode : List.of("waiter-write", "holder-before", "holder-after", "waiter-remove")) acquisitionFailure(mode);
                failedReentry(); changedOwnerDuringRegistration(); staleWrapperRelease(); releaseMetadataRecovery();
                remoteObservation(); concurrentWaiters("recordWaiter"); concurrentWaiters("removeWaiter");
                concurrentWaiters("cleanupVictimWaiters"); waiterMutexFailures();
                eventMetadata();
                System.out.println("DEADLOCK_OWNERSHIP_DATABASE: checks=" + checks + "; safety_defects=" + defects
                        + "; real_redis=true; real_mysql=true; actual_release=true; message_registration=true; transport_delivery=false; time=controlled_monitor_record_age; isolated_schema=" + schema);
            } finally {
                try {
                    if (first != null) {
                        for (String key : KEYS) {
                            if (!key.startsWith("A3OWN" + TAG + ":") && !key.startsWith("lock:task:A3OWN" + TAG + ":")) throw new IllegalStateException("Exclusive key required");
                            // These lock names were generated by this process and never handed to business services.
                            first.getLock(TENANT + ":" + key).forceUnlock();
                            cache.deleteObject("sys:lock:holder:" + key);
                            cache.deleteObject("sys:lock:waiter:" + key);
                            cache.deleteObject("sys:lock:waiter-stamp:" + key);
                            check(!first.getLock(TENANT + ":sys:lock:metadata:waiter:" + key).isLocked(), "waiter metadata mutex released");
                            check(!first.getLock(TENANT + ":" + key).isLocked() && cache.getCacheObject("sys:lock:holder:" + key) == null
                                    && cache.getCacheObject("sys:lock:waiter:" + key) == null, "exclusive keys removed");
                        }
                    }
                } finally {
                    if (second != null) second.shutdown();
                    if (first != null) first.shutdown();
                    TenantContext.clear(); UserContext.clear();
                    if (created) {
                        if (!schema.matches("a3_lock_[a-f0-9]{12}")) throw new IllegalStateException("Owned schema required");
                        statement.execute("DROP DATABASE %s".formatted(schema));
                        try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='%s'".formatted(schema))) {
                            check(result.next() && result.getInt(1) == 0, "owned schema removed");
                        }
                    }
                }
                System.out.println("DEADLOCK_OWNERSHIP_RESTORED: exclusive_keys_removed=true; temporary_schema_removed=true; original_schema_untouched=true");
            }
        }
        System.out.println("DEADLOCK_OWNERSHIP_FINAL: checks=" + checks + "; safety_defects=" + defects + "; cleanup_verified=true");
        if (defects != 0) throw new AssertionError("DEADLOCK_OWNERSHIP_SAFETY_DEFECTS=" + defects);
    }

    private static RedissonClient client() {
        return client(30000);
    }

    private static RedissonClient client(long watchdogMillis) {
        Config config = new Config().setThreads(2).setNettyThreads(2).setLockWatchdogTimeout(watchdogMillis);
        config.useSingleServer().setAddress("redis://127.0.0.1:" + System.getenv("LOCK_CHECK_REDIS_PORT"))
                .setPassword(System.getenv("LOCK_CHECK_REDIS_PASSWORD"))
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4)
                .setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        return Redisson.create(config);
    }

    private static void businessTransactions() throws Exception {
        int before = checks;
        RedissonClient renewableClient = client(3000);
        DeadlockDetectionService service = detector(renewableClient, sender);
        DeadlockDetectionService observer = detector(second, sender);
        WorkflowBusinessLockService business = new WorkflowBusinessLockService(service, renewableClient);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        String initial = jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class);
        try {
            String natural = businessKey("natural");
            try (WorkflowBusinessLockService.BusinessLock outer = business.getLock(natural)) {
                check(outer.tryLock(0, TimeUnit.SECONDS), "renewable business lock acquired");
                business.execute(transactions, status -> {
                    jdbc.update("UPDATE sys_user SET nick_name='renewable-committed' WHERE user_id=91");
                    try (WorkflowBusinessLockService.BusinessLock inner = business.getLock(natural)) {
                        try { check(inner.tryLock(0, TimeUnit.SECONDS), "business lock reentry acquired"); }
                        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
                    }
                    pauseBusiness(7000);
                    safety(renewableClient.getLock(TENANT + ":" + natural).getHoldCount() == 2
                            && cache.getCacheObject("sys:lock:holder:" + natural) != null, "business_renewal_survives_two_original_leases_and_defers_inner_release");
                    RLock other = second.getLock(TENANT + ":" + natural);
                    try {
                        boolean acquired = other.tryLock(0, 1, TimeUnit.SECONDS);
                        safety(!acquired, "business_renewal_keeps_other_client_out_until_commit");
                        if (acquired) other.unlock();
                    } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
                    return null;
                });
                safety(renewableClient.getLock(TENANT + ":" + natural).getHoldCount() == 1, "business_commit_releases_only_deferred_reentrant_layer");
            }
            safety("renewable-committed".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class))
                    && !renewableClient.getLock(TENANT + ":" + natural).isLocked()
                    && cache.getCacheObject("sys:lock:holder:" + natural) == null, "business_commit_and_final_cleanup_complete");

            String revoked = businessKey("revoked");
            boolean rolledBack = false;
            try (WorkflowBusinessLockService.BusinessLock lock = business.getLock(revoked)) {
                check(lock.tryLock(0, TimeUnit.SECONDS), "revocation business lock acquired");
                try {
                    business.execute(transactions, status -> {
                        jdbc.update("UPDATE sys_user SET nick_name='must-rollback' WHERE user_id=91");
                        try { age(service, revoked); }
                        catch (Exception failure) { throw new IllegalStateException(failure); }
                        safety(scanElsewhere(workers, observer, revoked) == 1, "business_timeout_releases_exact_live_generation");
                        return null;
                    });
                } catch (com.cloudflow.workflow.exception.WorkflowException failure) {
                    rolledBack = contains(failure, "审批占用已失效");
                }
            }
            safety(rolledBack && "renewable-committed".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class)),
                    "business_revoked_request_rolls_back_real_mysql_before_commit");

            String committing = businessKey("committing");
            try (WorkflowBusinessLockService.BusinessLock lock = business.getLock(committing)) {
                check(lock.tryLock(0, TimeUnit.SECONDS), "commit protected business lock acquired");
                business.execute(transactions, status -> {
                    jdbc.update("UPDATE sys_user SET nick_name='commit-protected' WHERE user_id=91");
                    try { age(service, committing); }
                    catch (Exception failure) { throw new IllegalStateException(failure); }
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override public void beforeCommit(boolean readOnly) {
                            safety(scanElsewhere(workers, observer, committing) == 0
                                    && renewableClient.getLock(TENANT + ":" + committing).isHeldByCurrentThread()
                                    && cache.getCacheObject("sys:lock:holder:" + committing) != null,
                                    "business_commit_gate_blocks_timeout_release_and_retains_monitor");
                        }
                    });
                    return null;
                });
            }
            safety("commit-protected".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class)),
                    "business_commit_gate_allows_real_transaction_to_finish");

            String stale = businessKey("stale-token");
            DeadlockDetectionService.LockToken oldToken = service.tryRenewableLock(stale, 0, 3);
            check(oldToken != null, "old renewable token acquired");
            age(service, stale);
            safety(scanElsewhere(workers, observer, stale) == 1, "old token actually revoked");
            DeadlockDetectionService.LockToken newToken = service.tryRenewableLock(stale, 0, 3);
            check(newToken != null && !newToken.generation().equals(oldToken.generation()), "same owner receives new generation");
            try {
                safety(!service.renewWithDetection(oldToken), "business_old_renewal_cannot_extend_same_owner_new_generation");
                service.unlockWithDetection(oldToken);
                safety(service.isHeldWithDetection(newToken), "business_old_cleanup_cannot_release_same_owner_new_generation");
                TenantContext.setTenantId(TENANT + 1);
                boolean foreignRejected = false;
                try { service.renewWithDetection(newToken); } catch (IllegalStateException expected) { foreignRejected = true; }
                finally { TenantContext.setTenantId(TENANT); }
                safety(foreignRejected && service.isHeldWithDetection(newToken), "business_token_cannot_cross_tenant");
            } finally { service.unlockWithDetection(newToken); }

            String failedRenewal = businessKey("failed-renewal");
            boolean renewalRolledBack = false;
            try (WorkflowBusinessLockService.BusinessLock lock = business.getLock(failedRenewal)) {
                check(lock.tryLock(0, TimeUnit.SECONDS), "failed renewal business lock acquired");
                try {
                    business.execute(transactions, status -> {
                        jdbc.update("UPDATE sys_user SET nick_name='renewal-must-rollback' WHERE user_id=91");
                        cache.deleteObject("sys:lock:holder:" + failedRenewal);
                        pauseBusiness(4000);
                        return null;
                    });
                } catch (com.cloudflow.workflow.exception.WorkflowException failure) { renewalRolledBack = contains(failure, "审批占用已失效"); }
            }
            safety(renewalRolledBack && "commit-protected".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class))
                    && !renewableClient.getLock(TENANT + ":" + failedRenewal).isLocked(), "business_missing_monitor_stops_renewal_and_rolls_back_real_mysql");
            businessCycle(business, observer, workers);
            nestedBusinessTransactions(business, renewableClient);
            System.out.println("DEADLOCK_BUSINESS_TRANSACTIONS: checks=" + (checks - before)
                    + "; natural_renewal_millis=7000; original_lease_millis=3000; real_commit=true; real_rollback=true; generation_protection=true");
        } finally {
            business.stopRenewals();
            workers.shutdownNow(); check(workers.awaitTermination(10, TimeUnit.SECONDS), "business lock workers stopped");
            renewableClient.shutdown();
            clearEventMetadata();
            jdbc.update("UPDATE sys_user SET nick_name=? WHERE user_id=91", initial);
        }
    }

    private static void nestedBusinessTransactions(WorkflowBusinessLockService business, RedissonClient client) throws Exception {
        TransactionTemplate independent = new TransactionTemplate(Objects.requireNonNull(transactions.getTransactionManager()));
        independent.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        String original = jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=92", String.class);
        String outerKey = businessKey("nested-outer"), innerKey = businessKey("nested-inner"), callbackKey = businessKey("after-commit");
        try {
            try (WorkflowBusinessLockService.BusinessLock outer = business.getLock(outerKey)) {
                check(outer.tryLock(0, TimeUnit.SECONDS), "nested outer lock acquired");
                business.execute(transactions, status -> {
                    jdbc.update("UPDATE sys_user SET nick_name='nested-outer' WHERE user_id=91");
                    business.execute(independent, innerStatus -> {
                        try (WorkflowBusinessLockService.BusinessLock inner = business.getLock(innerKey);
                             WorkflowBusinessLockService.BusinessLock reentry = business.getLock(outerKey)) {
                            try {
                                check(inner.tryLock(0, TimeUnit.SECONDS) && reentry.tryLock(0, TimeUnit.SECONDS), "independent transaction acquires and reenters locks");
                            } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
                            jdbc.update("UPDATE sys_user SET nick_name='nested-independent' WHERE user_id=92");
                        }
                        return null;
                    });
                    safety(client.getLock(TENANT + ":" + outerKey).getHoldCount() == 1
                            && !client.getLock(TENANT + ":" + innerKey).isLocked(), "business_independent_commit_preserves_suspended_outer_lock_and_releases_inner");
                    status.setRollbackOnly();
                    return null;
                });
            }
            safety("nested-independent".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=92", String.class))
                    && !"nested-outer".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class)),
                    "business_independent_commit_survives_outer_real_rollback");
            try (WorkflowBusinessLockService.BusinessLock outer = business.getLock(outerKey)) {
                check(outer.tryLock(0, TimeUnit.SECONDS), "after commit outer lock acquired");
                business.execute(transactions, status -> {
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override public void afterCommit() {
                            business.execute(independent, innerStatus -> {
                                try (WorkflowBusinessLockService.BusinessLock callback = business.getLock(callbackKey)) {
                                    try { check(callback.tryLock(0, TimeUnit.SECONDS), "after commit new transaction lock acquired"); }
                                    catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
                                    jdbc.update("UPDATE sys_user SET nick_name='after-commit-independent' WHERE user_id=92");
                                }
                                return null;
                            });
                        }
                    });
                    return null;
                });
            }
            safety("after-commit-independent".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=92", String.class)),
                    "business_after_commit_independent_transaction_commits_real_write");
            safety(!client.getLock(TENANT + ":" + outerKey).isLocked() && !client.getLock(TENANT + ":" + innerKey).isLocked()
                    && !client.getLock(TENANT + ":" + callbackKey).isLocked()
                    && TransactionSynchronizationManager.getResource(business) == null,
                    "business_nested_and_after_commit_clear_all_locks_and_transaction_context");
        } finally { jdbc.update("UPDATE sys_user SET nick_name=? WHERE user_id=92", original); }
    }

    private static void businessCycle(WorkflowBusinessLockService business, DeadlockDetectionService observer, ExecutorService workers) throws Exception {
        String left = businessKey("cycle-left"), right = businessKey("cycle-right");
        CountDownLatch held = new CountDownLatch(2), begin = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int index = 0; index < 2; index++) {
            String firstKey = index == 0 ? left : right, secondKey = index == 0 ? right : left;
            results.add(workers.submit(() -> {
                TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT);
                try (WorkflowBusinessLockService.BusinessLock firstLock = business.getLock(firstKey);
                     WorkflowBusinessLockService.BusinessLock secondLock = business.getLock(secondKey)) {
                    if (!firstLock.tryLock(0, TimeUnit.SECONDS)) throw new IllegalStateException("Cycle initial lock unavailable");
                    held.countDown(); if (!begin.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("Cycle start timed out");
                    if (!secondLock.tryLock(5, TimeUnit.SECONDS)) return false;
                    return business.execute(transactions, status -> {
                        jdbc.update("UPDATE sys_user SET nick_name='cycle-committed' WHERE user_id=91"); return true;
                    });
                } catch (com.cloudflow.workflow.exception.WorkflowException expected) {
                    if (!contains(expected, "审批占用已失效")) throw expected;
                    return false;
                } finally { TenantContext.clear(); UserContext.clear(); }
            }));
        }
        check(held.await(5, TimeUnit.SECONDS), "two business requests own opposing locks"); begin.countDown();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while ((cache.getCacheObject("sys:lock:waiter:" + left) == null || cache.getCacheObject("sys:lock:waiter:" + right) == null)
                && System.nanoTime() < deadline) Thread.sleep(20);
        check(cache.getCacheObject("sys:lock:waiter:" + left) != null && cache.getCacheObject("sys:lock:waiter:" + right) != null,
                "two real business requests form monitored circular wait");
        com.cloudflow.common.job.model.JobResult result = observer.detectDeadlocks();
        int committed = 0;
        for (Future<Boolean> resultFuture : results) if (resultFuture.get(10, TimeUnit.SECONDS)) committed++;
        safety(committed == 1 && "cycle-committed".equals(jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=91", String.class)),
                "business_real_circular_wait_commits_one_request_and_rejects_revoked_request");
        safety(!first.getLock(TENANT + ":" + left).isLocked() && !first.getLock(TENANT + ":" + right).isLocked()
                && cache.getCacheObject("sys:lock:holder:" + left) == null && cache.getCacheObject("sys:lock:holder:" + right) == null,
                "business_circular_recovery_releases_handles_and_renewal_records");
        check(result != null, "business circular detection returned real result");
    }

    private static int scanElsewhere(ExecutorService workers, DeadlockDetectionService observer, String key) {
        try {
            return workers.submit(() -> {
                TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT);
                try {
                    List<RuntimeException> failures = new ArrayList<>();
                    int count = scan(observer, key, failures);
                    if (!failures.isEmpty()) throw failures.get(0);
                    return count;
                } finally { TenantContext.clear(); UserContext.clear(); }
            }).get(10, TimeUnit.SECONDS);
        } catch (Exception failure) { throw new IllegalStateException("Owned business scan failed", failure); }
    }

    private static void pauseBusiness(long millis) {
        try { Thread.sleep(millis); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
    }

    private static String businessKey(String suffix) {
        String key = "lock:task:A3OWN" + TAG + ":" + suffix;
        KEYS.add(key); return key;
    }

    private static DeadlockDetectionService detector(RedissonClient client, MessageSender messages) throws Exception {
        DeadlockDetectionService service = new DeadlockDetectionService();
        WorkflowProperties properties = new WorkflowProperties();
        properties.getLock().setDeadlockTimeout(60);
        String scanKey = "A3OWN" + TAG + ":scan";
        if (!KEYS.contains(scanKey)) KEYS.add(scanKey);
        RedissonClient isolated = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
            if (method.getName().equals("getLock") && args[0].equals("lock:scheduled:detectDeadlocks")) return client.getLock(TENANT + ":" + scanKey);
            return forwarded(client, method, args);
        });
        inject(service, "redissonClient", isolated); inject(service, "redisCache", cache);
        inject(service, "workflowProperties", properties); inject(service, "sysNoticeService", messages);
        inject(service, "users", users); inject(service, "transactions", transactions);
        return service;
    }

    private static void databaseRollback() throws Exception {
        String key = key("rollback");
        DeadlockDetectionService service = detector(first, sender);
        check(service.tryLockWithDetection(key, 0, 300), "actual managed lock acquired");
        age(service, key);
        jdbc.execute("CREATE TRIGGER own_lock_second_message BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF (SELECT COUNT(*) FROM outbox_event)=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_SECOND_NOTICE_FAILURE'; END IF; END");
        List<RuntimeException> failures = new ArrayList<>();
        check(scan(service, key, failures) == 0 && failures.size() == 1 && contains(failures.get(0), "OWNED_SECOND_NOTICE_FAILURE"), "real second message insert failure reported");
        check(messages() == 0 && first.getLock(TENANT + ":" + key).isHeldByCurrentThread() && holders(service).size() == 1,
                "real transaction rolls back first insert and retains actual lock");
        jdbc.execute("DROP TRIGGER own_lock_second_message");
        failures.clear();
        check(scan(service, key, failures) == 1 && failures.isEmpty() && messages() == 2, "recovery registers both administrators and actually releases one lock");
        check(!first.getLock(TENANT + ":" + key).isLocked() && holders(service).isEmpty(), "real lock and record cleared after recovery");
        check(scan(service, key, failures) == 0 && messages() == 2, "repeat has no duplicate messages or release");
        System.out.println("DEADLOCK_OWNERSHIP_CASE: mysql_second_insert_rollback=PASS; actual_release_recovery=PASS; repeat=PASS");
    }

    private static void changedOwner() throws Exception {
        String key = key("changed");
        DeadlockDetectionService old = detector(first, sender);
        DeadlockDetectionService newer = detector(second, sender);
        check(old.tryLockWithDetection(key, 0, 300), "old owner acquired"); age(old, key);
        // Release the physical lock while deliberately retaining the old process's observation.
        first.getLock(TENANT + ":" + key).unlock();
        check(newer.tryLockWithDetection(key, 0, 300), "different client takes same key");
        String newerRecord = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key);
        boolean readable;
        try { readable = cache.getCacheObject("sys:lock:holder:" + key) instanceof Map<?, ?>; }
        catch (org.springframework.data.redis.serializer.SerializationException failure) { readable = false; }
        safety(readable, "holder_record_round_trip");
        List<RuntimeException> failures = new ArrayList<>();
        int count = scan(old, key, failures);
        safety(second.getLock(TENANT + ":" + key).isHeldByCurrentThread(), "new_client_lock_retained");
        safety(Objects.equals(newerRecord, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key)), "new_client_record_retained");
        safety(count == 0, "stale_observation_does_not_count_release");
    }

    private static void duringNotice() throws Exception {
        String key = key("during-notice");
        DeadlockDetectionService newer = detector(second, sender);
        boolean[] changed = {false};
        MessageSender changeOnNotice = request -> {
            sender.send(request);
            if (!changed[0]) {
                first.getLock(TENANT + ":" + key).unlock();
                check(newer.tryLockWithDetection(key, 0, 300), "new owner during real message registration");
                changed[0] = true;
            }
        };
        DeadlockDetectionService old = detector(first, changeOnNotice);
        check(old.tryLockWithDetection(key, 0, 300), "notification race old owner acquired"); age(old, key);
        List<RuntimeException> failures = new ArrayList<>();
        int count = scan(old, key, failures);
        check(changed[0] && failures.isEmpty(), "ownership changed between observation and release");
        safety(second.getLock(TENANT + ":" + key).isHeldByCurrentThread() && count == 0, "new_owner_during_notice_retained");
    }

    private static void reentrancy() throws Exception {
        String key = key("reentry");
        DeadlockDetectionService service = detector(first, sender);
        check(service.tryLockWithDetection(key, 0, 300), "same thread first entry");
        age(service, key);
        Object firstObservation = holders(service).get(TENANT + ":" + key);
        Field acquiredAt = firstObservation.getClass().getDeclaredField("acquireTime"); acquiredAt.setAccessible(true);
        long originalAge = acquiredAt.getLong(firstObservation);
        check(service.tryLockWithDetection(key, 0, 300), "same thread reentry");
        safety(acquiredAt.getLong(holders(service).get(TENANT + ":" + key)) == originalAge, "reentry_retains_original_acquisition_time");
        check(first.getLock(TENANT + ":" + key).getHoldCount() == 2, "real reentrant count two");
        service.unlockWithDetection(key);
        check(first.getLock(TENANT + ":" + key).getHoldCount() == 1, "one release leaves physical lock held");
        safety(holders(service).containsKey(TENANT + ":" + key) && raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key) != null,
                "partial_reentrant_unlock_retains_monitoring");
        service.unlockWithDetection(key);
    }

    private static void sameOwnerNewGeneration() throws Exception {
        String key = key("same-owner-new-generation");
        DeadlockDetectionService[] services = new DeadlockDetectionService[1];
        boolean[] reacquired = {false};
        MessageSender reenter = request -> {
            sender.send(request);
            if (!reacquired[0]) {
                services[0].unlockWithDetection(key);
                check(services[0].tryLockWithDetection(key, 0, 300), "same client and thread acquire new generation during notice");
                reacquired[0] = true;
            }
        };
        services[0] = detector(first, reenter);
        check(services[0].tryLockWithDetection(key, 0, 300), "same-owner original generation acquired");
        age(services[0], key);
        List<RuntimeException> failures = new ArrayList<>();
        int count = scan(services[0], key, failures);
        check(reacquired[0] && failures.isEmpty(), "same-owner race executed");
        safety(count == 0 && first.getLock(TENANT + ":" + key).isHeldByCurrentThread()
                && holders(services[0]).containsKey(TENANT + ":" + key)
                && raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key) != null, "same_owner_new_generation_and_records_retained");
        services[0].unlockWithDetection(key);
    }

    private static void waitingClient() throws Exception {
        String key = key("waiting-client");
        DeadlockDetectionService service = detector(first, sender);
        check(service.tryLockWithDetection(key, 0, 300), "lock acquired before waiter");
        age(service, key);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        CountDownLatch attempting = new CountDownLatch(1);
        try {
            Future<Boolean> waiting = executor.submit(() -> {
                RLock lock = second.getLock(TENANT + ":" + key);
                attempting.countDown();
                boolean acquired = lock.tryLock(10, 30, TimeUnit.SECONDS);
                if (acquired) lock.unlock();
                return acquired;
            });
            check(attempting.await(2, TimeUnit.SECONDS), "real waiting thread started");
            Thread.sleep(200);
            check(!waiting.isDone(), "other client waits while old generation held");
            List<RuntimeException> failures = new ArrayList<>();
            check(scan(service, key, failures) == 1 && failures.isEmpty(), "original generation released with real waiter present");
            check(waiting.get(3, TimeUnit.SECONDS), "real Redisson subscriber awakened without waiting for lease expiration");
            System.out.println("DEADLOCK_OWNERSHIP_CASE: real_waiter_wakeup=PASS");
        } finally {
            executor.shutdownNow();
            check(executor.awaitTermination(5, TimeUnit.SECONDS), "waiter thread stopped");
        }
    }

    private static void expiredSameOwner() throws Exception {
        String key = key("expired-same-owner");
        DeadlockDetectionService old = detector(first, sender);
        DeadlockDetectionService newer = detector(first, sender);
        check(old.tryLockWithDetection(key, 0, 1), "one-second lease acquired"); age(old, key);
        Thread.sleep(1200);
        check(!first.getLock(TENANT + ":" + key).isLocked(), "real lease expired without forced deletion");
        check(newer.tryLockWithDetection(key, 0, 300), "same client and thread reacquired after real expiration");
        String record = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key);
        List<RuntimeException> failures = new ArrayList<>();
        safety(scan(old, key, failures) == 0 && failures.isEmpty() && first.getLock(TENANT + ":" + key).isHeldByCurrentThread()
                && Objects.equals(record, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key)), "same_owner_after_real_expiration_retained");
        newer.unlockWithDetection(key);
    }

    private static void finiteLeases() throws Exception {
        String key = key("invalid-lease");
        DeadlockDetectionService service = detector(first, sender);
        for (long lease : List.of(-1L, 0L, Long.MAX_VALUE)) {
            boolean rejected = false;
            try { service.tryLockWithDetection(key, 0, lease); }
            catch (IllegalArgumentException expected) { rejected = true; }
            check(rejected && !first.getLock(TENANT + ":" + key).isLocked() && holders(service).isEmpty(), "invalid or automatic-renewal business lease rejected before acquisition");
        }
    }

    private static final class RegistrationCache extends RedisCache {
        private final String lockKey;
        private final String mode;
        private boolean armed = true;
        private Runnable beforeFailure = () -> { };
        private RegistrationCache(String lockKey, String mode) {
            this.lockKey = lockKey; this.mode = mode; this.redisTemplate = cache.redisTemplate;
        }
        @Override public <T> void setCacheObject(String key, T value, long timeout, TimeUnit unit) {
            boolean holder = key.equals("sys:lock:holder:" + lockKey);
            boolean waiter = key.equals("sys:lock:waiter:" + lockKey);
            if (armed && ((holder && mode.startsWith("holder-")) || (waiter && mode.equals("waiter-write")))) {
                armed = false;
                if (mode.equals("holder-after")) super.setCacheObject(key, value, timeout, unit);
                beforeFailure.run();
                throw new IllegalStateException("controlled-registration-" + mode);
            }
            super.setCacheObject(key, value, timeout, unit);
        }
        @Override public boolean deleteObject(String key) {
            if (armed && mode.equals("waiter-remove") && key.equals("sys:lock:waiter:" + lockKey)) {
                armed = false;
                throw new IllegalStateException("controlled-registration-waiter-remove");
            }
            return super.deleteObject(key);
        }
    }

    private static void acquisitionFailure(String mode) throws Exception {
        String key = key("registration-" + mode);
        DeadlockDetectionService service = detector(first, sender);
        inject(service, "redisCache", new RegistrationCache(key, mode));
        if (mode.startsWith("waiter-")) {
            AtomicBoolean armed = new AtomicBoolean(true);
            RedissonClient controlled = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
                Object result = forwarded(first, method, args);
                if (method.getName().equals("getScript")) return Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class}, (script, operation, parameters) -> {
                    if (operation.getName().equals("eval") && ((String) parameters[1]).contains("deadlock-waiter-state")) {
                        Object[] values = (Object[]) parameters[4];
                        boolean removing = ((String) values[1]).isEmpty();
                        if (removing == mode.equals("waiter-remove") && armed.compareAndSet(true, false)) throw new IllegalStateException("controlled-registration-" + mode);
                    }
                    return forwarded(result, operation, parameters);
                });
                return result;
            });
            inject(service, "redissonClient", controlled);
        }
        RuntimeException observed = null;
        boolean acquired = false;
        try { acquired = service.tryLockWithDetection(key, 0, 300); }
        catch (RuntimeException failure) { observed = failure; }
        safety(!acquired && contains(observed, "controlled-registration-" + mode), mode + "_reports_original_failure");
        safety(!first.getLock(TENANT + ":" + key).isLocked(), mode + "_does_not_leak_acquired_lock");
        safety(cache.getCacheObject("sys:lock:holder:" + key) == null && cache.getCacheObject("sys:lock:waiter:" + key) == null
                && holders(service).isEmpty(), mode + "_removes_owned_metadata");
    }

    private static void failedReentry() throws Exception {
        String key = key("registration-reentry");
        DeadlockDetectionService service = detector(first, sender);
        check(service.tryLockWithDetection(key, 0, 300), "first layer before failed reentry");
        Object original = holders(service).get(TENANT + ":" + key);
        String record = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key);
        inject(service, "redisCache", new RegistrationCache(key, "holder-before"));
        RuntimeException observed = null;
        try { service.tryLockWithDetection(key, 0, 300); } catch (RuntimeException failure) { observed = failure; }
        safety(contains(observed, "controlled-registration-holder-before") && first.getLock(TENANT + ":" + key).getHoldCount() == 1,
                "failed_reentry_releases_only_new_layer");
        safety(holders(service).get(TENANT + ":" + key) == original && Objects.equals(record, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key)),
                "failed_reentry_preserves_original_record");
        service.unlockWithDetection(key);
        safety(!first.getLock(TENANT + ":" + key).isLocked() && holders(service).isEmpty(), "original_layer_releases_normally_after_failed_reentry");
    }

    private static void changedOwnerDuringRegistration() throws Exception {
        String key = key("registration-new-owner");
        DeadlockDetectionService old = detector(first, sender), newer = detector(second, sender);
        RegistrationCache faults = new RegistrationCache(key, "holder-after");
        String[] newRecord = {null};
        faults.beforeFailure = () -> {
            first.getLock(TENANT + ":" + key).forceUnlock();
            check(newer.tryLockWithDetection(key, 0, 300), "new client acquires while old registration fails");
            newRecord[0] = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key);
        };
        inject(old, "redisCache", faults);
        RuntimeException observed = null;
        try { old.tryLockWithDetection(key, 0, 300); } catch (RuntimeException failure) { observed = failure; }
        safety(contains(observed, "controlled-registration-holder-after") && second.getLock(TENANT + ":" + key).isHeldByCurrentThread(),
                "failed_registration_preserves_new_owner");
        safety(Objects.equals(newRecord[0], raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key)) && holders(old).isEmpty(),
                "failed_registration_does_not_delete_new_record");
        newer.unlockWithDetection(key);
    }

    private static void staleWrapperRelease() throws Exception {
        String key = key("registration-stale-release");
        DeadlockDetectionService old = detector(first, sender), newer = detector(first, sender);
        check(old.tryLockWithDetection(key, 0, 300), "old wrapper owns initial generation");
        first.getLock(TENANT + ":" + key).forceUnlock();
        check(newer.tryLockWithDetection(key, 0, 300), "same client and thread owns new generation through another wrapper");
        String record = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key);
        old.unlockWithDetection(key);
        safety(first.getLock(TENANT + ":" + key).isHeldByCurrentThread()
                && Objects.equals(record, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + key)) && holders(old).isEmpty(),
                "stale_wrapper_release_preserves_new_same_thread_generation");
        newer.unlockWithDetection(key);
    }

    private static void releaseMetadataRecovery() throws Exception {
        String key = key("registration-release-cleanup");
        boolean[] armed = {false};
        RedissonClient faultClient = RedissonClient.class.cast(Proxy.newProxyInstance(RedissonClient.class.getClassLoader(),
                new Class<?>[]{RedissonClient.class}, (target, method, values) -> {
                    Object result = forwarded(first, method, values);
                    if (!method.getName().equals("getScript")) return result;
                    return RScript.class.cast(Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class},
                            (script, operation, parameters) -> {
                                if (armed[0] && operation.getName().equals("eval") && parameters[1] instanceof String source && source.contains("cjson.decode")) {
                                    armed[0] = false;
                                    throw new IllegalStateException("controlled-release-metadata-failure");
                                }
                                return forwarded(result, operation, parameters);
                            }));
                }));
        DeadlockDetectionService service = detector(faultClient, sender);
        check(service.tryLockWithDetection(key, 0, 300), "actual lock before release cleanup fault");
        armed[0] = true;
        RuntimeException observed = null;
        try { service.unlockWithDetection(key); } catch (RuntimeException failure) { observed = failure; }
        safety(contains(observed, "controlled-release-metadata-failure") && !first.getLock(TENANT + ":" + key).isLocked(),
                "release_cleanup_failure_visible_after_actual_unlock");
        safety(!holders(service).isEmpty() && cache.getCacheObject("sys:lock:holder:" + key) != null,
                "failed_release_metadata_retained_for_retry");
        service.unlockWithDetection(key);
        safety(holders(service).isEmpty() && cache.getCacheObject("sys:lock:holder:" + key) == null,
                "release_cleanup_retry_finishes_without_reacquiring_lock");
    }

    private static Object forwarded(Object target, Method method, Object[] args) throws Throwable {
        try { return method.invoke(target, args); }
        catch (InvocationTargetException failure) { throw failure.getCause(); }
    }

    private static void precommitRecovery() throws Exception {
        String left = key("precommit-left"), right = key("precommit-right");
        DeadlockDetectionService owner = detector(first, sender), peer = detector(second, sender);
        String firstThread = first.getId() + ":" + Thread.currentThread().getId();
        String secondThread = second.getId() + ":" + Thread.currentThread().getId();
        long beforeMessages = messages();
        try {
            check(owner.tryLockWithDetection(left, 0, 300) && peer.tryLockWithDetection(right, 0, 300), "precommit cycle holds two real locks");
            Map<String, Object> older = new HashMap<>(cache.getCacheObject("sys:lock:holder:" + left));
            older.put("acquireTime", System.currentTimeMillis() - 5000L);
            cache.setCacheObject("sys:lock:holder:" + left, older, 310, TimeUnit.SECONDS);
            waiter(owner, "recordWaiter", right, firstThread);
            waiter(peer, "recordWaiter", left, secondThread);
            check(((List<?>) owner.manualDetect().get("deadlockChains")).size() == 1, "precommit failure begins with one actual cross-client cycle");
            RedissonClient interrupted = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
                Object result = forwarded(first, method, args);
                if (method.getName().equals("getScript")) return Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class}, (script, operation, parameters) -> {
                    if (operation.getName().equals("eval") && ((String) parameters[1]).contains("deadlock-event-commit")) {
                        throw new IllegalStateException("OWNED_EVENT_BEFORE_COMMIT");
                    }
                    return forwarded(result, operation, parameters);
                });
                return result;
            });
            DeadlockDetectionService failing = detector(interrupted, sender);
            boolean failed = false;
            try { failing.detectDeadlocks(); }
            catch (RuntimeException failure) {
                failed = contains(failure, "OWNED_EVENT_BEFORE_COMMIT");
                System.out.println("DEADLOCK_RECOVERY_PROBE: final_commit_failure=" + failed + "; exception=" + failure.getClass().getSimpleName()
                        + "; suppressed=" + failure.getSuppressed().length);
                for (Throwable item : failure.getSuppressed()) System.out.println("DEADLOCK_RECOVERY_PROBE: cause="
                        + (item.getCause() == null ? "none" : item.getCause().getClass().getSimpleName()));
            }
            System.out.println("DEADLOCK_RECOVERY_PROBE: left_held=" + first.getLock(TENANT + ":" + left).isHeldByCurrentThread()
                    + "; right_locked=" + second.getLock(TENANT + ":" + right).isLocked());
            check(failed && !second.getLock(TENANT + ":" + right).isLocked() && first.getLock(TENANT + ":" + left).isHeldByCurrentThread(), "actual cycle release precedes visible final registration failure");
            check(eventCount() == 0 && statCount() == 0, "precommit failure has not saved event or statistics");
            safety(cache.keys("sys:deadlock:recovery:*").size() == 1, "precommit_failure_keeps_durable_recovery_entry");
            DeadlockDetectionService fresh = detector(second, sender);
            check(holders(fresh).isEmpty() && ((List<?>) fresh.manualDetect().get("deadlockChains")).isEmpty(), "fresh instance cannot rediscover the already broken cycle");
            com.cloudflow.common.job.model.JobResult recovered = fresh.detectDeadlocks();
            safety(eventCount() == 1 && statCount() == 1 && recovered.getAffectedRows() == 0
                    && recovered.getResultMsg().contains("解除循环等待1条"), "fresh_scan_finishes_precommit_recovery_without_releasing_again");
            if (eventCount() == 1) {
                Map<String, Object> event = fresh.getRecentVictimEvents(1).get(0);
                safety(((Number) event.get("releasedLockCount")).intValue() == 1
                        && event.get("releasedLocks").equals(List.of(right)), "replayed_event_keeps_actual_original_release_outcome");
            }
            fresh.detectDeadlocks();
            safety(eventCount() == 1 && statCount() == 1 && cache.keys("sys:deadlock:recovery:*").isEmpty()
                    && messages() == beforeMessages + 2, "precommit_recovery_clears_pending_and_deduplicates_events_and_notices");
        } finally {
            waiter(owner, "removeWaiter", right, firstThread); waiter(peer, "removeWaiter", left, secondThread);
            owner.unlockWithDetection(left); peer.unlockWithDetection(right); clearEventMetadata();
            jdbc.update("DELETE FROM outbox_event");
        }
    }

    private static void recoveryBoundary(String boundary) throws Exception {
        String left = key("recovery-" + boundary + "-left"), right = key("recovery-" + boundary + "-right");
        DeadlockDetectionService owner = detector(first, sender), peer = detector(second, sender);
        String firstThread = first.getId() + ":" + Thread.currentThread().getId(), secondThread = second.getId() + ":" + Thread.currentThread().getId();
        AtomicBoolean fired = new AtomicBoolean();
        String marker = boundary.startsWith("prepare") ? "deadlock-recovery-prepare" : boundary.startsWith("release") ? "deadlock-recovery-release"
                : boundary.startsWith("cleanup") ? "cjson.decode" : boundary.startsWith("waiter") ? "deadlock-waiter-state"
                : "deadlock-event-commit";
        boolean after = boundary.endsWith("after");
        try {
            check(owner.tryLockWithDetection(left, 0, 300) && peer.tryLockWithDetection(right, 0, 300), "recovery boundary has exclusive real holders");
            Map<String, Object> older = new HashMap<>(cache.getCacheObject("sys:lock:holder:" + left));
            older.put("acquireTime", System.currentTimeMillis() - 5000L); cache.setCacheObject("sys:lock:holder:" + left, older, 310, TimeUnit.SECONDS);
            waiter(owner, "recordWaiter", right, firstThread); waiter(peer, "recordWaiter", left, secondThread);
            RedissonClient faulty = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
                Object result = forwarded(first, method, args);
                if (method.getName().equals("getScript")) return Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class}, (script, operation, parameters) -> {
                    boolean selected = operation.getName().equals("eval") && ((String) parameters[1]).contains(marker) && fired.compareAndSet(false, true);
                    if (selected && !after) throw new IllegalStateException("OWNED_RECOVERY_" + boundary);
                    Object value = forwarded(result, operation, parameters);
                    if (selected) throw new IllegalStateException("OWNED_RECOVERY_" + boundary);
                    return value;
                });
                return result;
            });
            boolean reported = false;
            try { detector(faulty, sender).detectDeadlocks(); }
            catch (RuntimeException failure) { reported = contains(failure, "OWNED_RECOVERY_" + boundary); }
            check(reported && fired.get(), "recovery boundary reached and failure reported: " + boundary);
            boolean releaseOccurred = !second.getLock(TENANT + ":" + right).isLocked();
            boolean committed = boundary.equals("commit-after");
            safety(eventCount() == (committed ? 1 : 0) && statCount() == (committed ? 1 : 0), boundary + "_event_and_statistics_remain_together");
            safety(cache.keys("sys:deadlock:recovery:*").size() == (boundary.equals("prepare-before") || committed ? 0 : 1), boundary + "_pending_survives_required_boundary");
            String newHolder = null, newWaiter = null, newStamp = null;
            if (releaseOccurred) {
                waiter(owner, "removeWaiter", right, firstThread);
                check(peer.tryLockWithDetection(right, 0, 300), "same client and thread acquires a new generation after recovery interruption");
                newHolder = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + right);
                waiter(peer, "removeWaiter", left, secondThread); waiter(peer, "recordWaiter", left, secondThread);
                newWaiter = raw.opsForValue().get(TENANT + ":sys:lock:waiter:" + left);
                newStamp = raw.opsForValue().get(TENANT + ":sys:lock:waiter-stamp:" + left);
            }
            DeadlockDetectionService fresh = detector(second, sender);
            com.cloudflow.common.job.model.JobResult recovered = fresh.detectDeadlocks();
            safety(eventCount() == 1 && statCount() == 1 && cache.keys("sys:deadlock:recovery:*").isEmpty(), boundary + "_fresh_scan_finishes_once");
            safety(recovered.getAffectedRows() == (releaseOccurred ? 0 : 1) && messages() == 2, boundary + "_actual_release_count_and_notice_deduplication");
            Map<String, Object> event = fresh.getRecentVictimEvents(1).get(0);
            safety(event.get("releasedLocks").equals(List.of(right)) && ((Number) event.get("releasedLockCount")).intValue() == 1, boundary + "_journal_preserves_real_release_outcome");
            if (releaseOccurred) safety(second.getLock(TENANT + ":" + right).isHeldByCurrentThread()
                    && Objects.equals(newHolder, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + right))
                    && Objects.equals(newWaiter, raw.opsForValue().get(TENANT + ":sys:lock:waiter:" + left))
                    && Objects.equals(newStamp, raw.opsForValue().get(TENANT + ":sys:lock:waiter-stamp:" + left)), boundary + "_new_generation_and_recreated_waiter_preserved");
            fresh.detectDeadlocks(); safety(eventCount() == 1 && statCount() == 1 && messages() == 2, boundary + "_repeat_has_no_duplicate_effects");
            if (committed) {
                // Controlled expiry of this case's own event and identity represents a restart beyond seven days.
                raw.delete(cache.keys("sys:deadlock:victim:*")); raw.delete(cache.keys("sys:deadlock:identity:*"));
                fresh.detectDeadlocks();
                safety(eventCount() == 0 && statCount() == 1 && messages() == 2 && cache.keys("sys:deadlock:recovery:*").isEmpty(),
                        "lost_commit_ack_and_expired_event_do_not_recreate_completed_recovery");
            }
        } finally {
            waiter(owner, "removeWaiter", right, firstThread); waiter(peer, "removeWaiter", left, secondThread);
            owner.unlockWithDetection(left); peer.unlockWithDetection(right); clearEventMetadata(); jdbc.update("DELETE FROM outbox_event");
        }
    }

    private static void recoveryChangedState(String state) throws Exception {
        String left = key("recovery-state-" + state + "-left"), right = key("recovery-state-" + state + "-right"), extra = key("recovery-state-" + state + "-extra");
        DeadlockDetectionService owner = detector(first, sender), peer = detector(second, sender);
        String firstThread = first.getId() + ":" + Thread.currentThread().getId(), secondThread = second.getId() + ":" + Thread.currentThread().getId();
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        String scriptMarker = state.equals("no-admin") ? "deadlock-event-commit" : state.equals("partial") ? "deadlock-recovery-release" : "deadlock-recovery-prepare";
        try {
            check(owner.tryLockWithDetection(left, 0, 300) && peer.tryLockWithDetection(right, 0, 300), "changed-state recovery owns both real cycle locks");
            if (state.equals("partial")) check(peer.tryLockWithDetection(extra, 0, 300), "victim owns two independently recorded locks");
            Map<String, Object> older = new HashMap<>(cache.getCacheObject("sys:lock:holder:" + left));
            older.put("acquireTime", System.currentTimeMillis() - 5000L); cache.setCacheObject("sys:lock:holder:" + left, older, 310, TimeUnit.SECONDS);
            waiter(owner, "recordWaiter", right, firstThread); waiter(peer, "recordWaiter", left, secondThread);
            RedissonClient faulty = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
                Object result = forwarded(first, method, args);
                if (method.getName().equals("getScript")) return Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class}, (script, operation, parameters) -> {
                    boolean selected = operation.getName().equals("eval") && ((String) parameters[1]).contains(scriptMarker)
                            && calls.incrementAndGet() == (state.equals("partial") ? 2 : 1);
                    if (selected && !scriptMarker.equals("deadlock-recovery-prepare")) throw new IllegalStateException("OWNED_RECOVERY_STATE_" + state);
                    Object value = forwarded(result, operation, parameters);
                    if (selected) throw new IllegalStateException("OWNED_RECOVERY_STATE_" + state);
                    return value;
                });
                return result;
            });
            boolean reported = false;
            try { detector(faulty, sender).detectDeadlocks(); }
            catch (RuntimeException failure) { reported = contains(failure, "OWNED_RECOVERY_STATE_" + state); }
            check(reported && cache.keys("sys:deadlock:recovery:*").size() == 1, "changed-state failure leaves one real pending plan");
            DeadlockDetectionService fresh = detector(second, sender);
            String pendingKey = cache.keys("sys:deadlock:recovery:*").iterator().next();
            String pendingBefore = raw.opsForValue().get(pendingKey);
            String replaced = null, replacementHolder = null, replacementWaiter = null;
            if (state.equals("stale") || state.startsWith("cancel")) waiter(owner, "removeWaiter", right, firstThread);
            if (state.equals("generation")) {
                peer.unlockWithDetection(right); check(peer.tryLockWithDetection(right, 0, 300), "unstarted plan's owner reacquires a different generation");
                replacementHolder = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + right);
                java.lang.reflect.Method resume = DeadlockDetectionService.class.getDeclaredMethod("resumeRecovery", String.class); resume.setAccessible(true);
                int[] cancelled = (int[]) resume.invoke(fresh, pendingKey.substring((TENANT + ":").length()));
                safety(cancelled[0] == 0 && cancelled[1] == 0 && eventCount() == 0 && statCount() == 0 && messages() == 0
                        && cache.keys("sys:deadlock:recovery:*").isEmpty() && second.getLock(TENANT + ":" + right).isHeldByCurrentThread()
                        && Objects.equals(replacementHolder, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + right)),
                        "unstarted_plan_cancels_when_lock_generation_changes_even_with_same_cycle");
                waiter(owner, "removeWaiter", right, firstThread);
            }
            if (state.startsWith("cancel")) {
                AtomicBoolean cancellationFired = new AtomicBoolean();
                RedissonClient cancellationFault = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
                    Object result = forwarded(first, method, args);
                    if (method.getName().equals("getScript")) return Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class}, (script, operation, parameters) -> {
                        boolean selected = operation.getName().equals("eval") && ((String) parameters[1]).contains("deadlock-recovery-finish") && cancellationFired.compareAndSet(false, true);
                        if (selected && state.equals("cancel-before")) throw new IllegalStateException("OWNED_CANCEL_FAILURE");
                        Object value = forwarded(result, operation, parameters);
                        if (selected) throw new IllegalStateException("OWNED_CANCEL_FAILURE");
                        return value;
                    });
                    return result;
                });
                boolean cancellationReported = false;
                try { detector(cancellationFault, sender).detectDeadlocks(); } catch (RuntimeException failure) { cancellationReported = contains(failure, "OWNED_CANCEL_FAILURE"); }
                check(cancellationReported && cancellationFired.get(), "stale cancellation boundary actually interrupted");
                safety(raw.hasKey(pendingKey) == state.equals("cancel-before") && eventCount() == 0 && messages() == 0,
                        state + "_retains_only_uncommitted_cancellation_without_side_effects");
            }
            if (state.equals("no-admin")) jdbc.update("UPDATE sys_user SET status='1' WHERE tenant_id=?", TENANT);
            if (state.equals("partial")) {
                replaced = first.getLock(TENANT + ":" + right).isLocked() ? extra : right;
                check(peer.tryLockWithDetection(replaced, 0, 300), "same owner reacquires only the already released member of a partial plan");
                replacementHolder = raw.opsForValue().get(TENANT + ":sys:lock:holder:" + replaced);
                waiter(owner, "removeWaiter", right, firstThread);
                waiter(peer, "removeWaiter", left, secondThread); waiter(peer, "recordWaiter", left, secondThread);
                replacementWaiter = raw.opsForValue().get(TENANT + ":sys:lock:waiter:" + left);
            }
            if (state.equals("corrupt")) {
                String logical = pendingKey.substring((TENANT + ":").length());
                Map<String, Object> broken = new HashMap<>(cache.getCacheObject(logical)); broken.put("nextLock", -1);
                cache.setCacheObject(logical, broken, 60, TimeUnit.SECONDS);
                boolean rejected = false;
                try { fresh.detectDeadlocks(); } catch (RuntimeException failure) { rejected = true; }
                safety(rejected && eventCount() == 0 && first.getLock(TENANT + ":" + left).isHeldByCurrentThread()
                        && second.getLock(TENANT + ":" + right).isHeldByCurrentThread(), "malformed_pending_plan_is_retained_without_side_effects");
                TenantContext.setTenantId(TENANT + 1); UserContext.setTenantId(TENANT + 1);
                try { safety(fresh.detectDeadlocks().getAffectedRows() == 0 && raw.hasKey(pendingKey), "pending_replay_does_not_read_or_change_another_tenant"); }
                finally { TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT); }
                raw.opsForValue().set(pendingKey, Objects.requireNonNull(pendingBefore));
            }
            com.cloudflow.common.job.model.JobResult result = null;
            try { result = fresh.detectDeadlocks(); } catch (RuntimeException failure) { /* Report expected missing recovery rather than discard the other cases. */ }
            if (state.equals("stale") || state.startsWith("cancel") || state.equals("generation")) {
                safety(result != null && result.getAffectedRows() == 0 && eventCount() == 0 && statCount() == 0 && messages() == 0
                        && cache.keys("sys:deadlock:recovery:*").isEmpty() && first.getLock(TENANT + ":" + left).isHeldByCurrentThread()
                        && second.getLock(TENANT + ":" + right).isHeldByCurrentThread(), state + "_unstarted_plan_is_cancelled_without_releasing_normal_locks");
            } else {
                safety(result != null && eventCount() == 1 && statCount() == 1 && messages() == 2 && cache.keys("sys:deadlock:recovery:*").isEmpty(), state + "_changed_state_recovers_original_work_once");
                if (state.equals("partial") && result != null && eventCount() == 1) {
                    Map<String, Object> event = fresh.getRecentVictimEvents(1).get(0);
                    safety(result.getAffectedRows() == 1 && ((Number) event.get("releasedLockCount")).intValue() == 2
                            && new HashSet<>((List<?>) event.get("releasedLocks")).equals(Set.of(right, extra)), "partial_replay_counts_only_remaining_release_and_preserves_both_original_outcomes");
                    safety(second.getLock(TENANT + ":" + replaced).isHeldByCurrentThread()
                            && Objects.equals(replacementHolder, raw.opsForValue().get(TENANT + ":sys:lock:holder:" + replaced))
                            && Objects.equals(replacementWaiter, raw.opsForValue().get(TENANT + ":sys:lock:waiter:" + left)), "partial_replay_preserves_new_lock_and_recreated_waiter");
                }
            }
        } finally {
            jdbc.update("UPDATE sys_user SET status='0' WHERE tenant_id=?", TENANT);
            waiter(owner, "removeWaiter", right, firstThread); waiter(peer, "removeWaiter", left, secondThread);
            owner.unlockWithDetection(left); peer.unlockWithDetection(right); peer.unlockWithDetection(extra);
            clearEventMetadata(); jdbc.update("DELETE FROM outbox_event");
        }
    }

    private static void recoveryEventCommit() throws Exception {
        String pending = TENANT + ":sys:deadlock:recovery:owned-commit-" + TAG;
        DeadlockDetectionService service = detector(first, sender);
        Class<?> chainClass = Class.forName(DeadlockDetectionService.class.getName() + "$DeadlockChain");
        java.lang.reflect.Constructor<?> constructor = chainClass.getDeclaredConstructor(List.class); constructor.setAccessible(true);
        Object chain = constructor.newInstance(List.of("owned-cas", "other", "owned-cas"));
        Method commit = DeadlockDetectionService.class.getDeclaredMethod("recordVictimEvent", String.class, chainClass, List.class, String.class, String.class, String.class);
        commit.setAccessible(true);
        try {
            boolean missing = (Boolean) commit.invoke(service, "owned-cas", chain, List.of("released"), "owned-cas-generation", pending, "original");
            safety(!missing && eventCount() == 0 && statCount() == 0, "absent_plan_cannot_commit_event_or_statistics");
            raw.opsForValue().set(pending, "changed");
            boolean changed = (Boolean) commit.invoke(service, "owned-cas", chain, List.of("released"), "owned-cas-generation", pending, "original");
            safety(!changed && eventCount() == 0 && statCount() == 0 && "changed".equals(raw.opsForValue().get(pending)),
                    "changed_plan_cannot_commit_or_delete_current_plan");
            boolean committed = (Boolean) commit.invoke(service, "owned-cas", chain, List.of("released"), "owned-cas-generation", pending, "changed");
            safety(committed && eventCount() == 1 && statCount() == 1 && !raw.hasKey(pending), "exact_plan_commits_event_statistics_and_removal_together");
            raw.opsForValue().set(pending, "retry");
            boolean duplicate = (Boolean) commit.invoke(service, "owned-cas", chain, List.of("released"), "owned-cas-generation", pending, "retry");
            safety(duplicate && eventCount() == 1 && statCount() == 1 && !raw.hasKey(pending), "existing_event_removes_matching_plan_without_counting_again");
        } finally { clearEventMetadata(); }
    }

    private static void eventMetadata() throws Exception {
        check(cache.keys("sys:deadlock:*").isEmpty(), "exclusive tenant has no prior deadlock event metadata");
        try {
            DeadlockDetectionService one = detector(first, sender), two = detector(second, sender);
            event(one, "one", "generation-one"); event(two, "two", "generation-two");
            safety(eventCount() == 2 && statCount() == 2, "cross_instance_events_have_unique_ids_and_complete_statistics");
            String eventKey = cache.keys("sys:deadlock:victim:*").iterator().next();
            String identityKey = cache.keys("sys:deadlock:identity:*").stream().findFirst().orElse(null);
            Long eventTtl = raw.getExpire(eventKey, TimeUnit.MILLISECONDS), statsTtl = raw.getExpire(TENANT + ":sys:deadlock:stats", TimeUnit.MILLISECONDS);
            safety(identityKey != null && eventTtl > 604740000L && eventTtl <= 604800000L
                    && statsTtl > 2591940000L && statsTtl <= 2592000000L
                    && Math.abs(raw.getExpire(identityKey, TimeUnit.MILLISECONDS) - eventTtl) < 1000L, "event_identity_seven_day_and_statistics_thirty_day_retention");
            clearEventMetadata();
            one = detector(first, sender); two = detector(second, sender);
            event(one, "same", "same-generation"); event(two, "same", "same-generation");
            safety(eventCount() == 1 && statCount() == 1, "same_recovery_event_is_counted_once_across_instances");
            clearEventMetadata();
            one = detector(first, sender);
            for (int index = 0; index < 12; index++) event(one, "ordered-" + index, "ordered-generation-" + index);
            List<Map<String, Object>> recent = one.getRecentVictimEvents(3);
            safety(recent.size() == 3 && ((Number) recent.get(0).get("eventId")).longValue() == 12
                    && ((Number) recent.get(2).get("eventId")).longValue() == 10, "recent_events_sort_numeric_ids_before_limit");
            clearEventMetadata();
            legacyEventMetadata();
            clearEventMetadata();
            concurrentEvents();
            clearEventMetadata();
            raw.opsForSet().add(TENANT + ":sys:deadlock:stats", "owned-wrong-type");
            boolean failed = false;
            try { event(detector(first, sender), "malformed", "malformed-generation"); }
            catch (Exception expected) { failed = true; }
            safety(failed && eventCount() == 0 && raw.opsForSet().isMember(TENANT + ":sys:deadlock:stats", "owned-wrong-type"),
                    "statistics_type_failure_does_not_partially_save_event");
            clearEventMetadata();
            lostEventAcknowledgement();
        } finally {
            clearEventMetadata();
            check(cache.keys("sys:deadlock:*").isEmpty(), "exclusive tenant event metadata restored");
        }
    }

    private static void legacyEventMetadata() throws Exception {
        Map<String, Object> legacy = new HashMap<>();
        legacy.put("eventId", 90L); legacy.put("victimThread", "legacy-owned"); legacy.put("resolved", true);
        cache.setCacheObject("sys:deadlock:victim:90", legacy, 7, TimeUnit.DAYS);
        cache.setCacheObject("sys:deadlock:stats", new HashMap<>(Map.of("totalDeadlocks", 20L, "totalVictims", 20L, "firstOccurrence", "legacy-owned")), 30, TimeUnit.DAYS);
        String original = raw.opsForValue().get(TENANT + ":sys:deadlock:victim:90");
        event(detector(first, sender), "legacy-next", "legacy-next-generation");
        Map<String, Object> newest = detector(second, sender).getRecentVictimEvents(1).get(0);
        safety(((Number) newest.get("eventId")).longValue() == 91 && statCount() == 21
                && Objects.equals(original, raw.opsForValue().get(TENANT + ":sys:deadlock:victim:90")), "legacy_event_ids_and_statistics_are_preserved");
        clearEventMetadata();
        cache.setCacheObject("sys:deadlock:stats", new HashMap<>(Map.of("totalDeadlocks", 0L, "totalVictims", 0L, "lastEventId", 9007199254740992L)), 30, TimeUnit.DAYS);
        event(detector(first, sender), "precise-id", "precise-id-generation");
        newest = detector(second, sender).getRecentVictimEvents(1).get(0);
        safety(((Number) newest.get("eventId")).longValue() == 9007199254740993L
                && raw.hasKey(TENANT + ":sys:deadlock:victim:9007199254740993"), "event_ids_above_double_precision_are_preserved_exactly");
        clearEventMetadata();
        cache.setCacheObject("sys:deadlock:stats", new HashMap<>(Map.of("totalDeadlocks", Long.MAX_VALUE, "totalVictims", 1L, "lastEventId", 1L)), 30, TimeUnit.DAYS);
        String before = raw.opsForValue().get(TENANT + ":sys:deadlock:stats");
        boolean overflow = false;
        try { event(detector(first, sender), "overflow", "overflow-generation"); }
        catch (Exception expected) { overflow = true; }
        safety(overflow && eventCount() == 0 && Objects.equals(before, raw.opsForValue().get(TENANT + ":sys:deadlock:stats")),
                "counter_overflow_fails_before_writing_event_or_statistics");
    }

    private static void concurrentEvents() throws Exception {
        CountDownLatch firstRead = new CountDownLatch(1), secondRead = new CountDownLatch(1);
        DeadlockDetectionService one = detector(first, sender), two = detector(second, sender);
        Runnable slowRead = () -> {
            firstRead.countDown();
            try { secondRead.await(1, TimeUnit.SECONDS); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); }
        };
        eventReadGate(one, first, slowRead); eventReadGate(two, second, secondRead::countDown);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> left = executor.submit(() -> tenantEvent(one, "concurrent-one", "concurrent-generation-one"));
            check(firstRead.await(3, TimeUnit.SECONDS), "first real event statistics read reached gate");
            Future<?> right = executor.submit(() -> tenantEvent(two, "concurrent-two", "concurrent-generation-two"));
            left.get(10, TimeUnit.SECONDS); right.get(10, TimeUnit.SECONDS);
            safety(eventCount() == 2 && statCount() == 2, "concurrent_event_commits_preserve_both_events_and_counts");
        } finally {
            executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "event workers stopped");
        }
    }

    private static void eventReadGate(DeadlockDetectionService service, RedissonClient client, Runnable gate) throws Exception {
        AtomicBoolean read = new AtomicBoolean();
        RedisCache controlled = new RedisCache() {
            @Override public <T> T getCacheObject(String key) {
                T value = super.getCacheObject(key);
                if (key.equals("sys:deadlock:stats") && read.compareAndSet(false, true)) gate.run();
                return value;
            }
        };
        controlled.redisTemplate = new RedisConfig().redisTemplate(new RedissonConnectionFactory(client));
        inject(service, "redisCache", controlled);
        RedissonClient observed = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
            Object result = forwarded(client, method, args);
            if (method.getName().equals("getBucket") && args[0].equals(TENANT + ":sys:deadlock:stats")) {
                return Proxy.newProxyInstance(RBucket.class.getClassLoader(), new Class<?>[]{RBucket.class}, (bucket, operation, parameters) -> {
                    Object value = forwarded(result, operation, parameters);
                    if (operation.getName().equals("get") && read.compareAndSet(false, true)) gate.run();
                    return value;
                });
            }
            return result;
        });
        inject(service, "redissonClient", observed);
    }

    private static void lostEventAcknowledgement() throws Exception {
        AtomicBoolean lost = new AtomicBoolean();
        RedisCache controlled = new RedisCache() {
            @Override public <T> void setCacheObject(String key, T value, long timeout, TimeUnit unit) {
                super.setCacheObject(key, value, timeout, unit);
                if (key.startsWith("sys:deadlock:victim:") && lost.compareAndSet(false, true)) throw new IllegalStateException("OWNED_EVENT_ACK_LOSS");
            }
        };
        controlled.redisTemplate = cache.redisTemplate;
        RedissonClient interrupted = (RedissonClient) Proxy.newProxyInstance(RedissonClient.class.getClassLoader(), new Class<?>[]{RedissonClient.class}, (target, method, args) -> {
            Object result = forwarded(first, method, args);
            if (method.getName().equals("getScript")) return Proxy.newProxyInstance(RScript.class.getClassLoader(), new Class<?>[]{RScript.class}, (script, operation, parameters) -> {
                Object value = forwarded(result, operation, parameters);
                if (operation.getName().equals("eval") && ((String) parameters[1]).contains("deadlock-event-commit") && lost.compareAndSet(false, true)) {
                    throw new IllegalStateException("OWNED_EVENT_ACK_LOSS");
                }
                return value;
            });
            return result;
        });
        DeadlockDetectionService service = detector(interrupted, sender);
        inject(service, "redisCache", controlled);
        boolean visible = false;
        try { event(service, "ack-loss", "ack-loss-generation"); }
        catch (Exception failure) { visible = contains(failure, "OWNED_EVENT_ACK_LOSS"); }
        safety(visible && eventCount() == 1 && statCount() == 1, "lost_event_ack_keeps_committed_event_and_statistics_together");
        event(detector(second, sender), "ack-loss", "ack-loss-generation");
        safety(eventCount() == 1 && statCount() == 1, "lost_event_ack_retry_from_other_instance_is_idempotent");
    }

    private static void tenantEvent(DeadlockDetectionService service, String victim, String generation) {
        TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT);
        try { event(service, victim, generation); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
        finally { TenantContext.clear(); UserContext.clear(); }
    }

    private static void event(DeadlockDetectionService service, String victim, String generation) throws Exception {
        Class<?> chainClass = Class.forName(DeadlockDetectionService.class.getName() + "$DeadlockChain");
        java.lang.reflect.Constructor<?> constructor = chainClass.getDeclaredConstructor(List.class); constructor.setAccessible(true);
        Object chain = constructor.newInstance(List.of(victim, "other", victim));
        Method operation;
        try { operation = DeadlockDetectionService.class.getDeclaredMethod("recordVictimEvent", String.class, chainClass, List.class, String.class); }
        catch (NoSuchMethodException older) {
            operation = DeadlockDetectionService.class.getDeclaredMethod("recordVictimEvent", String.class, chainClass, List.class);
        }
        operation.setAccessible(true);
        if (operation.getParameterCount() == 4) operation.invoke(service, victim, chain, List.of("owned-event-lock"), generation);
        else operation.invoke(service, victim, chain, List.of("owned-event-lock"));
    }

    private static int eventCount() { return cache.keys("sys:deadlock:victim:*").size(); }
    private static long statCount() {
        Map<String, Object> stats = cache.getCacheObject("sys:deadlock:stats");
        return stats == null ? 0 : ((Number) stats.get("totalDeadlocks")).longValue();
    }
    private static void clearEventMetadata() {
        for (String physical : cache.keys("sys:deadlock:*")) {
            String prefix = TENANT + ":sys:deadlock:";
            if (!physical.startsWith(prefix)) throw new IllegalStateException("Exclusive event tenant required");
            raw.delete(physical);
        }
    }

    private static void remoteObservation() throws Exception {
        String left = key("remote-left"), right = key("remote-right");
        DeadlockDetectionService owner = detector(first, sender);
        DeadlockDetectionService peer = detector(second, sender);
        RedisCache peerCache = new RedisCache();
        peerCache.redisTemplate = new RedisConfig().redisTemplate(new RedissonConnectionFactory(second));
        inject(peer, "redisCache", peerCache);
        check(owner.tryLockWithDetection(left, 0, 300) && peer.tryLockWithDetection(right, 0, 300), "remote holders established on two clients");
        DeadlockDetectionService observer = detector(second, sender);
        inject(observer, "redisCache", peerCache);
        check(holders(observer).isEmpty(), "fresh observer has no local holder state");
        @SuppressWarnings("unchecked") List<Map<String, Object>> observed = (List<Map<String, Object>>) observer.getLockStatistics().get("locks");
        safety(observed.stream().anyMatch(item -> left.equals(item.get("lockKey")))
                && observed.stream().anyMatch(item -> right.equals(item.get("lockKey"))), "fresh_instance_reads_both_remote_holders");
        Map<String, Object> record = new HashMap<>(cache.getCacheObject("sys:lock:holder:" + left));
        Map<String, Object> legacy = new HashMap<>(record); legacy.remove("leaseTime");
        cache.setCacheObject("sys:lock:holder:" + left, legacy, 310, TimeUnit.SECONDS);
        @SuppressWarnings("unchecked") List<Map<String, Object>> legacyObserved = (List<Map<String, Object>>) observer.getLockStatistics().get("locks");
        safety(legacyObserved.stream().anyMatch(item -> left.equals(item.get("lockKey"))), "legacy_holder_without_lease_remains_readable");
        Map<String, Object> malformed = new HashMap<>(record); malformed.remove("generation");
        cache.setCacheObject("sys:lock:holder:" + left, malformed, 310, TimeUnit.SECONDS);
        List<RuntimeException> damaged = new ArrayList<>();
        safety(scan(observer, left, damaged) == 0 && damaged.size() == 1 && first.getLock(TENANT + ":" + left).isHeldByCurrentThread(),
                "malformed_remote_record_reports_failure_without_release");
        cache.setCacheObject("sys:lock:holder:" + left, record, 310, TimeUnit.SECONDS);
        TenantContext.setTenantId(TENANT + 1); UserContext.setTenantId(TENANT + 1);
        try { safety(((Integer) observer.getLockStatistics().get("totalLocks")) == 0, "remote_holder_scan_is_tenant_scoped"); }
        finally { TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT); }
        TenantContext.clear(); UserContext.clear();
        try {
            boolean rejected = false;
            try { observer.getLockStatistics(); }
            catch (IllegalStateException failure) { rejected = contains(failure, "缺少租户上下文"); }
            safety(rejected, "shared_holder_scan_requires_tenant_context");
        } finally { TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT); }
        waiter(owner, "recordWaiter", right, first.getId() + ":" + Thread.currentThread().getId());
        waiter(peer, "recordWaiter", left, second.getId() + ":" + Thread.currentThread().getId());
        safety(!((List<?>) observer.manualDetect().get("deadlockChains")).isEmpty(), "fresh_instance_detects_cross_client_cycle");
        waiter(owner, "removeWaiter", right, first.getId() + ":" + Thread.currentThread().getId());
        waiter(peer, "removeWaiter", left, second.getId() + ":" + Thread.currentThread().getId());
        age(owner, left);
        long before = messages();
        List<RuntimeException> failures = new ArrayList<>();
        int released = scan(observer, left, failures);
        safety(released == 1 && failures.isEmpty() && !first.getLock(TENANT + ":" + left).isLocked()
                && messages() == before + 2, "fresh_instance_releases_timed_out_generation_with_real_notice_transaction");
        safety(second.getLock(TENANT + ":" + right).isHeldByCurrentThread(), "remote_scan_preserves_unexpired_peer_lock");
        owner.unlockWithDetection(left); peer.unlockWithDetection(right);
    }

    /** Delay one real Redis read to expose lost updates; fixed code serializes it before the second read. */
    private static void concurrentWaiters(String operation) throws Exception {
        boolean remove = !operation.equals("recordWaiter");
        String key = key("waiter-race-" + operation);
        cache.setCacheObject("sys:lock:waiter:" + key, new HashSet<>(Set.of("keep", "remove")), 120, TimeUnit.SECONDS);
        CountDownLatch firstRead = new CountDownLatch(1), secondRead = new CountDownLatch(1);
        RedisCache slow = new RedisCache() {
            @Override public <T> T getCacheObject(String logical) {
                T result = super.getCacheObject(logical);
                if (logical.equals("sys:lock:waiter:" + key)) {
                    firstRead.countDown();
                    try { secondRead.await(1, TimeUnit.SECONDS); }
                    catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
                }
                return result;
            }
        };
        slow.redisTemplate = cache.redisTemplate;
        RedisCache fast = new RedisCache() {
            @Override public <T> T getCacheObject(String logical) {
                T result = super.getCacheObject(logical);
                if (logical.equals("sys:lock:waiter:" + key)) secondRead.countDown();
                return result;
            }
        };
        fast.redisTemplate = new RedisConfig().redisTemplate(new RedissonConnectionFactory(second));
        DeadlockDetectionService one = detector(first, sender), two = detector(second, sender);
        inject(one, "redisCache", slow); inject(two, "redisCache", fast);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> firstTask = executor.submit(() -> runWaiter(one, operation, key, remove ? "remove" : "one"));
            check(firstRead.await(3, TimeUnit.SECONDS), "first concurrent waiter read reached Redis");
            Future<?> secondTask = executor.submit(() -> runWaiter(two, "recordWaiter", key, "two"));
            firstTask.get(10, TimeUnit.SECONDS); secondTask.get(10, TimeUnit.SECONDS);
            Set<String> expected = remove ? Set.of("keep", "two") : Set.of("keep", "remove", "one", "two");
            safety(expected.equals(cache.getCacheObject("sys:lock:waiter:" + key)), operation.equals("cleanupVictimWaiters")
                    ? "victim_cleanup_preserves_concurrent_new_waiter" : remove ? "concurrent_remove_preserves_new_waiter" : "concurrent_registration_preserves_all_waiters");
        } finally {
            executor.shutdownNow();
            check(executor.awaitTermination(5, TimeUnit.SECONDS), "concurrent waiter workers stopped");
        }
    }

    private static void waiterMutexFailures() throws Exception {
        String key = key("waiter-mutex-failures");
        DeadlockDetectionService service = detector(first, sender);
        RLock mutex = second.getLock(TENANT + ":sys:lock:metadata:waiter:" + key);
        check(mutex.tryLock(0, 30, TimeUnit.SECONDS), "other client owns actual waiter mutex");
        try {
            boolean busy = false;
            try { waiter(service, "recordWaiter", key, "blocked"); }
            catch (InvocationTargetException failure) { busy = contains(failure, "等待记录更新锁繁忙"); }
            safety(busy && mutex.isHeldByCurrentThread() && cache.getCacheObject("sys:lock:waiter:" + key) == null,
                    "busy_waiter_mutex_does_not_mutate_or_release_foreign_owner");
            boolean interrupted = false;
            Thread.currentThread().interrupt();
            try { waiter(service, "recordWaiter", key, "interrupted"); }
            catch (InvocationTargetException failure) { interrupted = contains(failure, "等待记录更新被中断"); }
            finally {
                safety(interrupted && Thread.currentThread().isInterrupted(), "waiter_mutex_interruption_visible_and_flag_retained");
                Thread.interrupted();
            }
            ExecutorService executor = Executors.newSingleThreadExecutor();
            CountDownLatch started = new CountDownLatch(1);
            AtomicReference<Thread> worker = new AtomicReference<>();
            try {
                Future<Boolean> pending = executor.submit(() -> {
                    TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT);
                    worker.set(Thread.currentThread()); started.countDown();
                    try { waiter(service, "recordWaiter", key, "interrupted-during-wait"); return false; }
                    catch (InvocationTargetException failure) { return contains(failure, "等待记录更新被中断") && Thread.currentThread().isInterrupted(); }
                    finally { Thread.interrupted(); TenantContext.clear(); UserContext.clear(); }
                });
                check(started.await(3, TimeUnit.SECONDS), "waiter mutex worker started");
                Thread.sleep(200); worker.get().interrupt();
                safety(pending.get(3, TimeUnit.SECONDS) && mutex.isHeldByCurrentThread()
                        && cache.getCacheObject("sys:lock:waiter:" + key) == null, "waiter_mutex_interrupt_during_wait_preserves_owner_and_records");
            } finally {
                executor.shutdownNow(); check(executor.awaitTermination(5, TimeUnit.SECONDS), "interrupted mutex worker stopped");
            }
        } finally { mutex.unlock(); }
        waiter(service, "recordWaiter", key, "recovered");
        safety(Set.of("recovered").equals(cache.getCacheObject("sys:lock:waiter:" + key)), "waiter_mutex_recovers_after_owner_releases");
    }

    private static void runWaiter(DeadlockDetectionService service, String operation, String key, String thread) {
        TenantContext.setTenantId(TENANT); UserContext.setTenantId(TENANT);
        try { waiter(service, operation, key, thread); }
        catch (Exception failure) { throw new IllegalStateException(failure); }
        finally { TenantContext.clear(); UserContext.clear(); }
    }

    private static void waiter(DeadlockDetectionService service, String operation, String key, String thread) throws Exception {
        if (operation.equals("cleanupVictimWaiters")) {
            Method cleanup = DeadlockDetectionService.class.getDeclaredMethod(operation, String.class);
            cleanup.setAccessible(true); cleanup.invoke(service, thread); return;
        }
        Method method = DeadlockDetectionService.class.getDeclaredMethod(operation, String.class, String.class);
        method.setAccessible(true); method.invoke(service, key, thread);
    }

    private static String key(String name) { String key = "A3OWN" + TAG + ":" + name; KEYS.add(key); return key; }
    private static long messages() { return Objects.requireNonNull(jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event", Long.class)); }
    private static void age(DeadlockDetectionService service, String key) throws Exception {
        Object info = holders(service).get(TENANT + ":" + key);
        Field field = info.getClass().getDeclaredField("acquireTime"); field.setAccessible(true);
        field.setLong(info, System.currentTimeMillis() - 70000);
        Map<String, Object> record = new HashMap<>(cache.getCacheObject("sys:lock:holder:" + key));
        record.put("acquireTime", field.getLong(info));
        cache.setCacheObject("sys:lock:holder:" + key, record, 310, TimeUnit.SECONDS);
    }
    @SuppressWarnings("unchecked")
    private static Map<String, Object> holders(DeadlockDetectionService service) throws Exception {
        Field field = DeadlockDetectionService.class.getDeclaredField("lockHolders"); field.setAccessible(true);
        return (Map<String, Object>) field.get(service);
    }
    private static int scan(DeadlockDetectionService service, String key, List<RuntimeException> failures) throws Exception {
        Method method = DeadlockDetectionService.class.getDeclaredMethod("handleTimeoutLocks", List.class, List.class); method.setAccessible(true);
        return (Integer) method.invoke(service, List.of(key), failures);
    }
    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value);
    }
    private static boolean contains(Throwable error, String expected) {
        if (error == null) return false;
        if (String.valueOf(error.getMessage()).contains(expected) || contains(error.getCause(), expected)) return true;
        for (Throwable suppressed : error.getSuppressed()) if (contains(suppressed, expected)) return true;
        return false;
    }
    private static void safety(boolean value, String name) {
        checks++;
        if (!value) defects++;
        System.out.println("DEADLOCK_OWNERSHIP_SAFETY: " + name + "=" + (value ? "PASS" : "FAIL"));
    }
    private static void check(boolean value, String message) {
        checks++;
        if (!value) throw new AssertionError(message);
    }
}

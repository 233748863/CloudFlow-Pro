package com.cloudflow.workflow.service;

import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.redisson.api.RScript;
import org.redisson.RedissonObject;
import org.redisson.client.codec.StringCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import java.nio.charset.StandardCharsets;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * R.6: 死锁检测服务
 * 
 * 轻量级方案：基于 Redisson 现有锁机制 + Redis 监控 + 超时检测
 * 
 * 设计思路：
 * 1. 锁持有记录：在获取锁时记录持有者和时间戳到 Redis
 * 2. 超时检测：定时扫描超时未释放的锁
 * 3. 等待链分析：检测循环等待（A等B，B等A）
 * 4. 自动恢复：超时锁自动释放 + 告警通知
 * 
 * 相比复杂死锁检测算法的优势：
 * - 利用 Redisson 自带的锁超时机制
 * - 无需复杂的资源分配图算法
 * - 性能开销极小（仅 Redis 操作）
 * - 实现简单，易于维护
 * 
 * @author CloudFlow
 */
@Service
public class DeadlockDetectionService {

    private static final Logger log = LoggerFactory.getLogger(DeadlockDetectionService.class);

    /** 锁持有记录前缀 */
    private static final String LOCK_HOLDER_PREFIX = "sys:lock:holder:";

    /** 锁等待记录前缀 */
    private static final String LOCK_WAITER_PREFIX = "sys:lock:waiter:";
    private static final String WAITER_MUTEX_PREFIX = "sys:lock:metadata:waiter:";
    private static final String WAITER_STAMP_PREFIX = "sys:lock:waiter-stamp:";
    private static final String DEADLOCK_RECOVERY_PREFIX = "sys:deadlock:recovery:";
    private static final String COMMIT_GATE_PREFIX = "sys:lock:commit:";
    private static final String PREPARE_RECOVERY = """
            -- deadlock-recovery-prepare: pending work has no expiry before final registration.
            if redis.call('exists', KEYS[1]) == 1 then return 0 end
            redis.call('set', KEYS[1], ARGV[1])
            return 1
            """;
    private static final String RELEASE_RECOVERY_LOCK = """
            -- deadlock-recovery-release: outcome and old-generation release are one operation.
            if redis.call('get', KEYS[1]) ~= ARGV[1] then return -1 end
            if #KEYS > 3 and redis.call('exists', KEYS[4]) == 1 then return -2 end
            local matched = redis.call('hexists', KEYS[2], ARGV[2]) == 1
                and redis.call('hget', KEYS[2], ARGV[3]) == ARGV[4]
            redis.call('set', KEYS[1], matched and ARGV[5] or ARGV[6])
            if not matched then return 0 end
            redis.call('del', KEYS[2])
            redis.pcall('spublish', KEYS[3], '0')
            redis.pcall('publish', KEYS[3], '0')
            return 1
            """;
    private static final String FINISH_RECOVERY = """
            -- deadlock-recovery-finish: only remove the exact completed plan.
            if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end
            return redis.call('del', KEYS[1])
            """;
    private static final String WRITE_WAITER_STATE = """
            -- deadlock-waiter-state: preserve Set encoding and stamp every atomic mutation.
            if (redis.call('get', KEYS[2]) or '') ~= ARGV[1] then return 0 end
            if ARGV[2] == '' then
                redis.call('set', KEYS[2], ARGV[3], 'PX', 120000)
                redis.call('del', KEYS[1])
            else
                redis.call('mset', KEYS[1], ARGV[2], KEYS[2], ARGV[3])
                redis.call('pexpire', KEYS[1], 120000)
                redis.call('pexpire', KEYS[2], 120000)
            end
            return 1
            """;

    /** 死锁牺牲记录前缀 */
    private static final String DEADLOCK_VICTIM_PREFIX = "sys:deadlock:victim:";

    /** 死锁牺牲统计前缀 */
    private static final String DEADLOCK_STATS_KEY = "sys:deadlock:stats";
    private static final String DEADLOCK_IDENTITY_PREFIX = "sys:deadlock:identity:";
    private static final String COMMIT_VICTIM_EVENT = """
            -- deadlock-event-commit: validate every read before the single write batch.
            if #KEYS == 4 and redis.call('get', KEYS[4]) ~= ARGV[9] then return 3 end
            local previous = redis.call('get', KEYS[3])
            if previous then
                if not string.match(previous, '^%d+$') or redis.call('exists', ARGV[8] .. previous) == 0 then return -2 end
                if #KEYS == 4 then redis.call('del', KEYS[4]) end
                return 2
            end
            local stats = redis.call('get', KEYS[2])
            if (stats or '') ~= ARGV[1] or (stats and '1' or '0') ~= ARGV[2] then return 0 end
            if redis.call('exists', KEYS[1]) == 1 then return -1 end
            redis.call('mset', KEYS[1], ARGV[3], KEYS[2], ARGV[4], KEYS[3], ARGV[5])
            redis.call('pexpireat', KEYS[1], ARGV[6])
            redis.call('pexpireat', KEYS[2], ARGV[7])
            redis.call('pexpireat', KEYS[3], ARGV[6])
            if #KEYS == 4 then redis.call('del', KEYS[4]) end
            return 1
            """;

    /** Stored in the lock itself, so expiration and a subsequent acquisition cannot reuse a generation. */
    private static final String GENERATION_FIELD = "cloudflow:deadlock:generation";
    private static final String STAMP_GENERATION = """
            if redis.call('hexists', KEYS[1], ARGV[1]) == 0 then return nil end
            local generation = redis.call('hget', KEYS[1], ARGV[2])
            if not generation then
                generation = ARGV[3]
                redis.call('hset', KEYS[1], ARGV[2], generation)
            end
            return generation
            """;
    private static final String MATCH_GENERATION = """
            if redis.call('hexists', KEYS[1], ARGV[1]) == 1
                and redis.call('hget', KEYS[1], ARGV[2]) == ARGV[3] then return 1 end
            return 0
            """;
    private static final String RELEASE_GENERATION = """
            if #KEYS > 2 and redis.call('exists', KEYS[3]) == 1 then return 0 end
            if redis.call('hexists', KEYS[1], ARGV[1]) == 0
                or redis.call('hget', KEYS[1], ARGV[2]) ~= ARGV[3] then return 0 end
            redis.call('del', KEYS[1])
            -- Wake both supported Redisson subscription modes; Redis before 7 ignores SPUBLISH.
            redis.pcall('spublish', KEYS[2], '0')
            redis.call('publish', KEYS[2], '0')
            return 1
            """;
    private static final String RENEW_GENERATION = """
            -- Renewal only extends this exact owner, generation and matching monitor record.
            if redis.call('hexists', KEYS[1], ARGV[1]) == 0
                or redis.call('hget', KEYS[1], ARGV[2]) ~= ARGV[3] then return 0 end
            local value = redis.call('get', KEYS[2])
            if not value then return 0 end
            local info = cjson.decode(value)
            if info.generation ~= ARGV[3] or info.owner ~= ARGV[1] then return 0 end
            redis.call('pexpire', KEYS[1], ARGV[4])
            redis.call('pexpire', KEYS[2], ARGV[5])
            return 1
            """;
    private static final String REMOVE_GENERATION_RECORD = """
            local value = redis.call('get', KEYS[1])
            if not value then return 0 end
            local record = cjson.decode(value)
            if record.generation == ARGV[1] then return redis.call('del', KEYS[1]) end
            return 0
            """;

    /** 本实例取得的代次，仅用于释放及失败重入恢复；巡检从 Redis 读取。 */
    private final Map<String, LockInfo> lockHolders = new ConcurrentHashMap<>();

    /** 死锁牺牲计数器 */
    private final AtomicLong victimCounter = new AtomicLong(0);

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private WorkflowProperties workflowProperties;
    
    @Autowired
    private MessageSender sysNoticeService;

    @Autowired
    private TenantIterator tenantIterator;

    @Autowired
    private SysUserMapper users;

    @Autowired
    private TransactionTemplate transactions;

    // ==================== 核心 API ====================

    /** Captured acquisition identity; cleanup must never substitute a newer local holder. */
    public record LockToken(Long tenantId, String key, String threadId, String owner, String generation, long leaseSeconds) { }

    public LockToken tryRenewableLock(String key, long waitSeconds, long leaseSeconds) {
        if (!tryLockWithDetection(key, waitSeconds, leaseSeconds)) return null;
        LockInfo info = lockHolders.get(scopedLockKey(key));
        if (info == null || !getThreadIdentifier().equals(info.threadId) || !matchesGeneration(key, info)) {
            throw new IllegalStateException("审批锁登记后归属已变化");
        }
        return new LockToken(TenantContext.getTenantId(), key, info.threadId, info.owner, info.generation, leaseSeconds);
    }

    public boolean isHeldWithDetection(LockToken token) {
        requireTokenTenant(token);
        return getThreadIdentifier().equals(token.threadId()) && matchesGeneration(token.key(), tokenInfo(token));
    }

    public boolean renewWithDetection(LockToken token) {
        requireTokenTenant(token);
        Long renewed = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                RENEW_GENERATION, RScript.ReturnType.INTEGER,
                List.of(scopedLockKey(token.key()), scopedLockKey(LOCK_HOLDER_PREFIX + token.key())),
                token.owner(), GENERATION_FIELD, token.generation(), token.leaseSeconds() * 1000, (token.leaseSeconds() + 10) * 1000);
        return Long.valueOf(1).equals(renewed);
    }

    public void unlockWithDetection(LockToken token) {
        requireTokenTenant(token);
        if (!getThreadIdentifier().equals(token.threadId())) throw new IllegalStateException("审批锁只能由原请求释放");
        LockInfo info = tokenInfo(token);
        RLock lock = redissonClient.getLock(scopedLockKey(token.key()));
        if (matchesGeneration(token.key(), info) && lock.isHeldByCurrentThread()) lock.unlock();
        if (!matchesGeneration(token.key(), info)) removeLockHolder(token.key(), info);
    }

    public String commitGateKey(LockToken token) {
        requireTokenTenant(token);
        return scopedLockKey(COMMIT_GATE_PREFIX + token.threadId());
    }

    private void requireTokenTenant(LockToken token) {
        if (token == null || token.tenantId() == null || !token.tenantId().equals(TenantContext.getTenantId())) {
            throw new IllegalStateException("审批锁不属于当前租户");
        }
    }

    private static LockInfo tokenInfo(LockToken token) {
        LockInfo info = new LockInfo(token.threadId(), 0, token.leaseSeconds());
        info.owner = token.owner(); info.generation = token.generation(); return info;
    }

    /**
     * 安全获取锁（带死锁检测）
     * 
     * 使用方式：替换原有的 redissonClient.getLock().tryLock()
     * 
     * @param lockKey 锁的 key
     * @param waitTime 等待时间（秒）
     * @param leaseTime 锁持有时间（正数秒；业务锁使用有限租期）
     * @return 是否成功获取锁
     */
    public boolean tryLockWithDetection(String lockKey, long waitTime, long leaseTime) {
        // A fixed lease also prevents an old watchdog from renewing a later generation after recovery.
        if (leaseTime <= 0 || leaseTime > Long.MAX_VALUE / 1000 - 10) {
            throw new IllegalArgumentException("受监控业务锁必须设置有效的正数秒租期");
        }
        String threadId = getThreadIdentifier();
        String scoped = scopedLockKey(lockKey);
        RLock lock = redissonClient.getLock(scoped);
        LockInfo previous = lockHolders.get(scoped);
        LockInfo recorded = null;
        boolean acquired = false;
        try {
            recordWaiter(lockKey, threadId);
            acquired = lock.tryLock(waitTime, leaseTime, TimeUnit.SECONDS);
            if (acquired) {
                recorded = stampLockHolder(lockKey, threadId, leaseTime);
                saveLockHolder(lockKey, recorded);
                if (!matchesGeneration(lockKey, recorded)) throw new IllegalStateException("锁在持有记录登记期间已失效");
                lockHolders.put(scoped, recorded);
            }
            removeWaiter(lockKey, threadId);
            return acquired;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            IllegalStateException failure = new IllegalStateException("获取受监控锁被中断", interrupted);
            rollbackAcquisition(lockKey, threadId, lock, acquired, recorded, previous, failure);
            if (failure.getSuppressed().length > 0) throw failure;
            return false;
        } catch (RuntimeException failure) {
            rollbackAcquisition(lockKey, threadId, lock, acquired, recorded, previous, failure);
            throw failure;
        }
    }

    private void rollbackAcquisition(String lockKey, String threadId, RLock lock, boolean acquired,
                                     LockInfo recorded, LockInfo previous, RuntimeException failure) {
        try {
            if (acquired && lock.isHeldByCurrentThread()
                    && (recorded == null || matchesGeneration(lockKey, recorded))) lock.unlock();
            if (recorded != null) {
                if (matchesGeneration(lockKey, recorded)) {
                    // Undo only the new reentrant layer; its original owner and first acquisition stay valid.
                    if (previous != null && Objects.equals(previous.generation, recorded.generation)) {
                        lockHolders.replace(scopedLockKey(lockKey), recorded, previous);
                    }
                } else {
                    removeLockHolder(lockKey, recorded);
                }
            }
        } catch (RuntimeException cleanup) {
            if (cleanup != failure) failure.addSuppressed(cleanup);
        }
        try {
            removeWaiter(lockKey, threadId);
        } catch (RuntimeException cleanup) {
            if (cleanup != failure) failure.addSuppressed(cleanup);
        }
    }

    /**
     * 安全释放锁（带清理）
     */
    public void unlockWithDetection(String lockKey) {
        LockInfo expected = lockHolders.get(scopedLockKey(lockKey));
        RLock lock = redissonClient.getLock(scopedLockKey(lockKey));
        if (expected != null && matchesGeneration(lockKey, expected) && lock.isHeldByCurrentThread()) lock.unlock();
        // A failed metadata cleanup can be retried even after the actual lock was released.
        if (expected != null && !matchesGeneration(lockKey, expected)) removeLockHolder(lockKey, expected);
    }

    // ==================== 死锁检测机制 ====================

    /**
     * 定时检测死锁
     * 平台默认每10分钟执行一次
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "deadlock-detection-job", lockTime = 25)
    @JobHandler(value = "deadlockDetection", desc = "死锁检测")
    public JobResult detectDeadlocks() {
        String lockKey = "lock:scheduled:detectDeadlocks";
        RLock lock = redissonClient.getLock(lockKey);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return JobResult.builder().executeStatus("SKIPPED").affectedRows(0)
                    .resultMsg("死锁巡检已有任务执行，已跳过").build();
            List<RuntimeException> failures = new ArrayList<>();
            int[] counts = new int[3];
            for (Long tenantId : resolveTenantIds()) {
                try {
                    TenantBroker.runAs(tenantId, ignored -> {
                        int previousFailures = failures.size();
                        int[] pending = replayPendingRecoveries(failures);
                        counts[0] += pending[0];
                        counts[1] += pending[1];
                        try { counts[0] += handleTimeoutLocks(detectTimeoutLocks(), failures); }
                        catch (RuntimeException failure) { failures.add(new IllegalStateException("超时锁读取失败，租户：" + tenantId, failure)); }
                        try {
                            int[] circular = handleDeadlockChains(detectCircularWaits(), failures);
                            counts[0] += circular[0];
                            counts[1] += circular[1];
                        } catch (RuntimeException failure) { failures.add(new IllegalStateException("循环等待读取失败，租户：" + tenantId, failure)); }
                        if (failures.size() == previousFailures) counts[2] += cleanupExpiredRecords();
                    });
                } catch (RuntimeException failure) {
                    failures.add(new IllegalStateException("死锁巡检失败，租户：" + tenantId, failure));
                }
            }
            throwFailures(failures);
            return JobResult.success(counts[0], "死锁巡检完成：释放锁" + counts[0] + "个，解除循环等待"
                    + counts[1] + "条，清理过期记录" + counts[2] + "条");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("死锁巡检获取锁被中断", e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private List<Long> resolveTenantIds() {
        com.cloudflow.common.job.config.JobInvocationContext.Execution execution =
                com.cloudflow.common.job.config.JobInvocationContext.execution();
        if (execution != null && "deadlockDetection".equals(execution.handlerName())) return tenantIterator.listActiveTenantIds();
        Long tenantId = TenantContext.getTenantId();
        return tenantId == null ? tenantIterator.listActiveTenantIds() : List.of(tenantId);
    }

    private static void throwFailures(List<RuntimeException> failures) {
        if (failures.isEmpty()) return;
        IllegalStateException failure = new IllegalStateException("死锁巡检存在失败项：" + failures.size() + "项");
        failures.forEach(failure::addSuppressed);
        throw failure;
    }

    private static String scopedLockKey(String lockKey) {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) throw new IllegalStateException("死锁检测缺少租户上下文");
        return tenantId + ":" + lockKey;
    }

    private Map<String, LockInfo> currentLockHolders() {
        // Require context even when the shared cache is empty; never query an unscoped key pattern.
        scopedLockKey("");
        Map<String, LockInfo> current = new HashMap<>();
        Collection<String> keys = redisCache.keys(LOCK_HOLDER_PREFIX + "*");
        if (keys == null) return current;
        for (String physicalKey : keys) {
            String key = logicalRedisKey(physicalKey, LOCK_HOLDER_PREFIX).substring(LOCK_HOLDER_PREFIX.length());
            LockInfo info = readLockHolder(key);
            if (info != null) current.put(key, info);
        }
        return current;
    }

    private LockInfo readLockHolder(String lockKey) {
        Object value = redisCache.getCacheObject(LOCK_HOLDER_PREFIX + lockKey);
        if (value == null) return null;
        if (!(value instanceof Map<?, ?> record)
                || !(record.get("threadId") instanceof String threadId) || threadId.isBlank()
                || !(record.get("owner") instanceof String owner) || owner.isBlank()
                || !(record.get("generation") instanceof String generation) || generation.isBlank()
                || !(record.get("acquireTime") instanceof Number acquired) || acquired.longValue() <= 0) {
            throw new IllegalStateException("持锁监控记录不完整");
        }
        // Older records omit leaseTime. They remain detectable, but cannot use lease-based cleanup.
        long leaseTime = 0;
        if (record.containsKey("leaseTime")) {
            if (!(record.get("leaseTime") instanceof Number lease) || lease.longValue() <= 0
                    || lease.longValue() > Long.MAX_VALUE / 1000 - 10) throw new IllegalStateException("持锁监控租期无效");
            leaseTime = lease.longValue();
        }
        LockInfo info = new LockInfo(threadId, acquired.longValue(), leaseTime);
        info.owner = owner;
        info.generation = generation;
        return info;
    }

    private String logicalRedisKey(String physicalKey, String expectedPrefix) {
        String prefix = scopedLockKey(expectedPrefix);
        if (!physicalKey.startsWith(prefix)) throw new IllegalStateException("死锁巡检缓存不属于当前租户");
        return physicalKey.substring(scopedLockKey("").length());
    }

    private boolean matchesGeneration(String lockKey, LockInfo info) {
        if (info == null || info.generation == null) return false;
        Long matched = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_ONLY,
                MATCH_GENERATION, RScript.ReturnType.INTEGER, List.of(scopedLockKey(lockKey)),
                info.owner, GENERATION_FIELD, info.generation);
        return Long.valueOf(1).equals(matched);
    }

    private boolean releaseGeneration(String lockKey, LockInfo info) {
        String physical = scopedLockKey(lockKey);
        Long released = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                RELEASE_GENERATION, RScript.ReturnType.INTEGER,
                List.of(physical, RedissonObject.prefixName("redisson_lock__channel", physical), scopedLockKey(COMMIT_GATE_PREFIX + info.threadId)),
                info.owner, GENERATION_FIELD, info.generation);
        return Long.valueOf(1).equals(released);
    }

    /**
     * 检测超时锁
     */
    private List<String> detectTimeoutLocks() {
        List<String> timeoutLocks = new ArrayList<>();
        long now = System.currentTimeMillis();

        for (Map.Entry<String, LockInfo> entry : currentLockHolders().entrySet()) {
            LockInfo info = entry.getValue();
            long holdTime = (now - info.acquireTime) / 1000;

            // 从配置读取死锁检测超时阈值（sys.workflow.lock.deadlockTimeout）
            int timeoutThreshold = workflowProperties.getLock().getDeadlockTimeout();
            if (holdTime > timeoutThreshold) {
                timeoutLocks.add(entry.getKey());
                log.warn("[detectTimeoutLocks] 锁超时, lockKey={}, holdTime={}s, holder={}", 
                    entry.getKey(), holdTime, info.threadId);
            }
        }

        return timeoutLocks;
    }

    /**
     * 检测循环等待（简化版）
     * 检测 A等B，B等A 的情况
     */
    private List<DeadlockChain> detectCircularWaits() {
        List<DeadlockChain> chains = new ArrayList<>();

        // 构建等待图：waiter -> lockKey -> holder
        Map<String, Set<String>> waitGraph = buildWaitGraph();

        // 检测循环
        Set<String> identities = new HashSet<>();
        for (String waiter : waitGraph.keySet()) {
            Set<String> visited = new HashSet<>();
            List<String> path = new ArrayList<>();
            
            if (hasCycle(waiter, waitGraph, visited, path)) {
                String identity = path.stream().distinct().sorted().collect(Collectors.joining("\n"));
                if (identities.add(identity)) chains.add(new DeadlockChain(path));
                log.error("[detectCircularWaits] 发现死锁链: {}", path);
            }
        }

        return chains;
    }

    /**
     * 构建等待图
     */
    private Map<String, Set<String>> buildWaitGraph() {
        Map<String, Set<String>> graph = new HashMap<>();

        // 从 Redis 读取所有等待记录
        Collection<String> waiterKeys = redisCache.keys(LOCK_WAITER_PREFIX + "*");
        
        if (waiterKeys == null) return graph;
        for (String physicalKey : waiterKeys) {
            String key = logicalRedisKey(physicalKey, LOCK_WAITER_PREFIX);
            String lockKey = key.substring(LOCK_WAITER_PREFIX.length());
            Set<String> waiters = redisCache.getCacheObject(key);
            
            if (waiters != null) {
                LockInfo holder = readLockHolder(lockKey);
                if (holder != null && matchesGeneration(lockKey, holder)) {
                    for (String waiter : waiters) {
                        graph.computeIfAbsent(waiter, k -> new HashSet<>()).add(holder.threadId);
                    }
                }
            }
        }

        return graph;
    }

    /**
     * DFS 检测循环
     */
    private boolean hasCycle(String node, Map<String, Set<String>> graph, 
                            Set<String> visited, List<String> path) {
        if (path.contains(node)) {
            // 发现循环
            int cycleStart = path.indexOf(node);
            path.subList(0, cycleStart).clear();
            path.add(node);
            return true;
        }

        if (visited.contains(node)) {
            return false;
        }

        visited.add(node);
        path.add(node);

        Set<String> neighbors = graph.get(node);
        if (neighbors != null) {
            for (String neighbor : neighbors) {
                if (hasCycle(neighbor, graph, visited, path)) {
                    return true;
                }
            }
        }

        path.remove(path.size() - 1);
        return false;
    }

    /**
     * 处理超时锁
     */
    private int handleTimeoutLocks(List<String> timeoutLocks, List<RuntimeException> failures) {
        int released = 0;
        for (String lockKey : timeoutLocks) {
            try {
                LockInfo info = readLockHolder(lockKey);
                if (info == null) continue;
                if ((System.currentTimeMillis() - info.acquireTime) / 1000 <= workflowProperties.getLock().getDeadlockTimeout()) continue;
                if (matchesGeneration(lockKey, info)) {
                    sendDeadlockAlert("超时锁", lockKey, "锁持有时间超过 " + workflowProperties.getLock().getDeadlockTimeout()
                            + " 秒，巡检将按现有规则尝试解除，请查看任务日志确认处理结果。", info.generation);
                    if (releaseGeneration(lockKey, info)) released++;
                    else if (matchesGeneration(lockKey, info)) continue; // Transaction commit is protected; retain the monitored owner.
                }

                // 清理记录
                removeLockHolder(lockKey, info);

            } catch (Exception e) {
                failures.add(new IllegalStateException("超时锁处理失败，租户：" + TenantContext.getTenantId() + "，锁：" + lockKey, e));
            }
        }
        return released;
    }

    /**
     * 处理死锁链
     * 
     * 牺牲策略流程：
     * 1. 根据策略选择最优牺牲者（持有锁时间最短 → 回滚代价最小）
     * 2. 强制释放牺牲者持有的所有锁
     * 3. 清理牺牲者的等待记录
     * 4. 记录牺牲事件到 Redis（供监控和审计）
     * 5. 发送告警通知
     */
    private int[] handleDeadlockChains(List<DeadlockChain> chains, List<RuntimeException> failures) {
        int[] counts = new int[2];
        for (DeadlockChain chain : chains) {
            try {
                Map<String, Set<String>> graph = buildWaitGraph();
                boolean present = true;
                for (int index = 0; index < chain.nodes.size() - 1; index++) {
                    if (!graph.getOrDefault(chain.nodes.get(index), Set.of()).contains(chain.nodes.get(index + 1))) present = false;
                }
                if (!present) continue;
                String victim = selectVictim(chain);
                Map<String, LockInfo> victimLocks = currentLockHolders().entrySet().stream()
                        .filter(entry -> entry.getValue().threadId.equals(victim))
                        .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
                if (victimLocks.isEmpty()) continue;
                List<RecoveryLock> locks = victimLocks.entrySet().stream().sorted(Map.Entry.comparingByKey())
                        .map(entry -> new RecoveryLock(entry.getKey(), entry.getValue().owner, entry.getValue().generation)).toList();
                RecoveryPlan plan = new RecoveryPlan(victim, new ArrayList<>(chain.nodes), locks, snapshotRecoveryWaiters(victim), 0, List.of());
                String key = recoveryKey(plan);
                Long prepared = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                        PREPARE_RECOVERY, RScript.ReturnType.INTEGER, List.of(scopedLockKey(key)), encodeRecovery(plan));
                // A retained plan was already attempted at the start of this scan.
                if (Long.valueOf(0).equals(prepared)) continue;
                if (!Long.valueOf(1).equals(prepared)) throw new IllegalStateException("死锁恢复记录未保存");
                int[] recovered = resumeRecovery(key);
                counts[0] += recovered[0]; counts[1] += recovered[1];
            } catch (Exception e) {
                failures.add(new IllegalStateException("循环等待处理失败，租户：" + TenantContext.getTenantId(), e));
            }
        }
        return counts;
    }

    private int[] replayPendingRecoveries(List<RuntimeException> failures) {
        int[] counts = new int[2];
        try {
            Collection<String> keys = redisCache.keys(DEADLOCK_RECOVERY_PREFIX + "*");
            if (keys == null) return counts;
            for (String physical : keys.stream().sorted().toList()) {
                try {
                    int[] recovered = resumeRecovery(logicalRedisKey(physical, DEADLOCK_RECOVERY_PREFIX));
                    counts[0] += recovered[0]; counts[1] += recovered[1];
                } catch (RuntimeException failure) { failures.add(new IllegalStateException("未完成死锁恢复接续失败，租户：" + TenantContext.getTenantId(), failure)); }
            }
        } catch (RuntimeException failure) { failures.add(new IllegalStateException("未完成死锁恢复读取失败，租户：" + TenantContext.getTenantId(), failure)); }
        return counts;
    }

    private int[] resumeRecovery(String key) {
        int releasedNow = 0;
        int conflicts = 0;
        String physical = scopedLockKey(key);
        while (true) {
            String before = redissonClient.<String>getBucket(physical, StringCodec.INSTANCE).get();
            if (before == null) return new int[]{releasedNow, 0};
            RecoveryPlan plan = decodeRecovery(before);
            if (!key.equals(recoveryKey(plan))) throw new IllegalStateException("死锁恢复记录身份不一致");
            if (plan.nextLock() == 0) {
                if (!recoveryStillRequired(plan)) {
                    Long cancelled = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                            FINISH_RECOVERY, RScript.ReturnType.INTEGER, List.of(physical), before);
                    if (Long.valueOf(1).equals(cancelled)) return new int[]{releasedNow, 0};
                    if (!Long.valueOf(0).equals(cancelled)) throw new IllegalStateException("死锁恢复取消状态无效");
                    if (++conflicts > 32) throw new IllegalStateException("死锁恢复记录并发更新繁忙");
                    continue;
                }
                sendDeadlockAlert("循环等待", plan.chain().stream().distinct().sorted().collect(Collectors.joining(" -> ")),
                        "检测到循环等待，巡检将按现有规则尝试解除，请查看任务日志确认处理结果。", recoveryGeneration(plan));
            }
            if (plan.nextLock() < plan.locks().size()) {
                RecoveryLock observed = plan.locks().get(plan.nextLock());
                List<String> withRelease = new ArrayList<>(plan.released()); withRelease.add(observed.key());
                RecoveryPlan changed = new RecoveryPlan(plan.victim(), plan.chain(), plan.locks(), plan.waiters(), plan.nextLock() + 1, withRelease);
                RecoveryPlan skipped = new RecoveryPlan(plan.victim(), plan.chain(), plan.locks(), plan.waiters(), plan.nextLock() + 1, plan.released());
                String lock = scopedLockKey(observed.key());
                Long outcome = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                        RELEASE_RECOVERY_LOCK, RScript.ReturnType.INTEGER,
                        List.of(physical, lock, RedissonObject.prefixName("redisson_lock__channel", lock), scopedLockKey(COMMIT_GATE_PREFIX + plan.victim())),
                        before, observed.owner(), GENERATION_FIELD, observed.generation(), encodeRecovery(changed), encodeRecovery(skipped));
                if (Long.valueOf(-1).equals(outcome)) {
                    if (++conflicts > 32) throw new IllegalStateException("死锁恢复记录并发更新繁忙");
                } else if (Long.valueOf(-2).equals(outcome)) return new int[]{releasedNow, 0};
                else if (Long.valueOf(1).equals(outcome)) releasedNow++;
                else if (!Long.valueOf(0).equals(outcome)) throw new IllegalStateException("死锁恢复释放结果无效");
                continue;
            }
            for (RecoveryLock observed : plan.locks()) {
                LockInfo info = new LockInfo(plan.victim(), 0, 0); info.owner = observed.owner(); info.generation = observed.generation();
                removeLockHolder(observed.key(), info);
            }
            for (Map.Entry<String, String> waiter : plan.waiters().entrySet()) updateWaiter(waiter.getKey(), plan.victim(), false, waiter.getValue());
            boolean finished = recordVictimEvent(plan.victim(), new DeadlockChain(plan.chain()), plan.released(),
                    recoveryGeneration(plan), physical, before);
            return new int[]{releasedNow, finished ? 1 : 0};
        }
    }

    private boolean recoveryStillRequired(RecoveryPlan plan) {
        Map<String, Set<String>> graph = buildWaitGraph();
        for (int index = 0; index < plan.chain().size() - 1; index++) {
            if (!graph.getOrDefault(plan.chain().get(index), Set.of()).contains(plan.chain().get(index + 1))) return false;
        }
        for (RecoveryLock observed : plan.locks()) {
            LockInfo info = new LockInfo(plan.victim(), 0, 0); info.owner = observed.owner(); info.generation = observed.generation();
            if (!matchesGeneration(observed.key(), info)) return false;
        }
        return true;
    }

    private Map<String, String> snapshotRecoveryWaiters(String victim) {
        Map<String, String> result = new TreeMap<>();
        Collection<String> keys = redisCache.keys(LOCK_WAITER_PREFIX + "*");
        if (keys == null) return result;
        for (String physical : keys) {
            String lockKey = logicalRedisKey(physical, LOCK_WAITER_PREFIX).substring(LOCK_WAITER_PREFIX.length());
            RLock mutex = redissonClient.getLock(scopedLockKey(WAITER_MUTEX_PREFIX + lockKey));
            boolean acquired = false;
            try {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException("等待快照前已中断");
                acquired = mutex.tryLock(5, TimeUnit.SECONDS);
                if (!acquired) throw new IllegalStateException("等待快照锁繁忙");
                Set<String> waiters = redisCache.getCacheObject(LOCK_WAITER_PREFIX + lockKey);
                if (waiters != null && waiters.contains(victim)) result.put(lockKey, readWaiterStamp(lockKey));
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt(); throw new IllegalStateException("等待快照被中断", failure);
            } finally { if (acquired) mutex.unlock(); }
        }
        return result;
    }

    private String recoveryGeneration(RecoveryPlan plan) {
        return plan.locks().stream().map(lock -> lock.key() + ":" + lock.generation()).sorted().collect(Collectors.joining("\n"));
    }

    private String recoveryKey(RecoveryPlan plan) {
        return DEADLOCK_RECOVERY_PREFIX + UUID.nameUUIDFromBytes((plan.victim() + "\n" + recoveryGeneration(plan)).getBytes(StandardCharsets.UTF_8));
    }

    private String encodeRecovery(RecoveryPlan plan) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("victim", plan.victim()); value.put("chain", new ArrayList<>(plan.chain()));
        value.put("locks", plan.locks().stream().map(lock -> new LinkedHashMap<>(Map.of("key", lock.key(), "owner", lock.owner(), "generation", lock.generation()))).collect(Collectors.toCollection(ArrayList::new)));
        value.put("waiters", new LinkedHashMap<>(plan.waiters())); value.put("nextLock", plan.nextLock()); value.put("released", new ArrayList<>(plan.released()));
        return encodeCacheMap(value);
    }

    private RecoveryPlan decodeRecovery(String encoded) {
        Map<String, Object> value = decodeCacheMap(encoded);
        String victim = recoveryText(value.get("victim"));
        List<String> chain = recoveryStrings(value.get("chain"));
        if (chain.size() < 2 || !chain.get(0).equals(chain.get(chain.size() - 1)) || !chain.contains(victim)) throw new IllegalStateException("死锁恢复链无效");
        if (!(value.get("locks") instanceof List<?> entries) || entries.isEmpty()) throw new IllegalStateException("死锁恢复锁清单无效");
        List<RecoveryLock> locks = new ArrayList<>(); Set<String> names = new HashSet<>();
        for (Object entry : entries) {
            if (!(entry instanceof Map<?, ?> lock)) throw new IllegalStateException("死锁恢复锁格式无效");
            RecoveryLock observed = new RecoveryLock(recoveryText(lock.get("key")), recoveryText(lock.get("owner")), recoveryText(lock.get("generation")));
            if (!names.add(observed.key())) throw new IllegalStateException("死锁恢复锁重复"); locks.add(observed);
        }
        int next = Math.toIntExact(nonnegativeCounter(value.get("nextLock")));
        List<String> released = recoveryStrings(value.get("released"));
        Set<String> processed = locks.stream().limit(next).map(RecoveryLock::key).collect(Collectors.toSet());
        if (next > locks.size() || new HashSet<>(released).size() != released.size() || !processed.containsAll(released)) throw new IllegalStateException("死锁恢复进度无效");
        if (!(value.get("waiters") instanceof Map<?, ?> stamps)) throw new IllegalStateException("死锁恢复等待快照无效");
        Map<String, String> waiters = new TreeMap<>();
        for (Map.Entry<?, ?> stamp : stamps.entrySet()) {
            if (!(stamp.getValue() instanceof String text)) throw new IllegalStateException("死锁恢复等待代次无效");
            waiters.put(recoveryText(stamp.getKey()), text);
        }
        return new RecoveryPlan(victim, chain, locks, waiters, next, released);
    }

    private static String recoveryText(Object value) {
        if (!(value instanceof String text) || text.isBlank()) throw new IllegalStateException("死锁恢复字段无效");
        return text;
    }

    private static List<String> recoveryStrings(Object value) {
        if (!(value instanceof List<?> entries)) throw new IllegalStateException("死锁恢复列表无效");
        List<String> result = new ArrayList<>(); for (Object entry : entries) result.add(recoveryText(entry)); return result;
    }

    /**
     * 选择牺牲者
     * 
     * 选择策略（按优先级依次判断）：
     * 1. 持有锁时间最短的线程（回滚代价最小）
     * 2. 持有锁数量最少的线程（影响范围最小）
     * 3. 如果以上条件相同，选择链中最后加入的线程
     * 
     * @param chain 死锁链
     * @return 被选中的牺牲者线程标识
     */
    private String selectVictim(DeadlockChain chain) {
        // 去掉链尾的重复节点（环的闭合点）
        List<String> candidates = chain.nodes.subList(0, chain.nodes.size() - 1);

        if (candidates.size() == 1) {
            return candidates.get(0);
        }

        String bestVictim = null;
        long shortestHoldTime = Long.MAX_VALUE;
        int fewestLocks = Integer.MAX_VALUE;

        for (String candidate : candidates) {
            // 计算该线程持有的锁数量和最长持有时间
            int lockCount = 0;
            long maxHoldTime = 0;

            for (Map.Entry<String, LockInfo> entry : currentLockHolders().entrySet()) {
                if (entry.getValue().threadId.equals(candidate)) {
                    lockCount++;
                    long holdTime = System.currentTimeMillis() - entry.getValue().acquireTime;
                    maxHoldTime = Math.max(maxHoldTime, holdTime);
                }
            }

            // 优先选择持有时间最短的（回滚代价最小）
            // 持有时间相同时，选择持有锁数量最少的（影响范围最小）
            if (maxHoldTime < shortestHoldTime
                    || (maxHoldTime == shortestHoldTime && lockCount < fewestLocks)) {
                shortestHoldTime = maxHoldTime;
                fewestLocks = lockCount;
                bestVictim = candidate;
            }
        }

        // 兜底：如果所有候选者都没有锁持有记录，选择第一个
        return bestVictim != null ? bestVictim : candidates.get(0);
    }

    /**
     * 强制释放牺牲者持有的所有锁
     * 
     * @param victimThreadId 牺牲者线程标识
     * @return 被释放的锁 key 列表
     */
    private List<String> forceReleaseVictimLocks(String victimThreadId, Map<String, LockInfo> observedLocks) {
        List<String> releasedLocks = new ArrayList<>();

        // 遍历所有锁持有记录，找到牺牲者持有的锁
        List<RuntimeException> failures = new ArrayList<>();
        Iterator<Map.Entry<String, LockInfo>> iterator = observedLocks.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, LockInfo> entry = iterator.next();
            if (entry.getValue().threadId.equals(victimThreadId)) {
                String lockKey = entry.getKey();
                try {
                    if (releaseGeneration(lockKey, entry.getValue())) releasedLocks.add(lockKey);

                    // 清理 Redis 中的锁持有记录
                    removeLockHolder(lockKey, entry.getValue());
                } catch (Exception e) {
                    failures.add(new IllegalStateException("循环等待锁释放失败，锁：" + lockKey, e));
                }
            }
        }

        throwFailures(failures);
        return releasedLocks;
    }

    /**
     * 清理牺牲者的所有等待记录
     * 
     * @param victimThreadId 牺牲者线程标识
     */
    private void cleanupVictimWaiters(String victimThreadId) {
        List<RuntimeException> failures = new ArrayList<>();
            Collection<String> waiterKeys = redisCache.keys(LOCK_WAITER_PREFIX + "*");
            if (waiterKeys == null) {
                return;
            }

            for (String physicalKey : waiterKeys) {
                try {
                    String key = logicalRedisKey(physicalKey, LOCK_WAITER_PREFIX);
                    removeWaiter(key.substring(LOCK_WAITER_PREFIX.length()), victimThreadId);
                } catch (Exception e) {
                    failures.add(new IllegalStateException("循环等待记录清理失败", e));
                }
            }
        throwFailures(failures);
    }

    /**
     * 记录牺牲事件到 Redis（供监控和审计）
     * 
     * @param victimThreadId 牺牲者线程标识
     * @param chain 死锁链
     * @param releasedLocks 被释放的锁列表
     */
    private void recordVictimEvent(String victimThreadId, DeadlockChain chain, List<String> releasedLocks, String generation) {
        recordVictimEvent(victimThreadId, chain, releasedLocks, generation, null, null);
    }

    private boolean recordVictimEvent(String victimThreadId, DeadlockChain chain, List<String> releasedLocks, String generation,
            String recoveryPhysicalKey, String recoveryBefore) {
        try {
            if (generation == null || generation.isBlank()) throw new IllegalStateException("死锁事件缺少持锁代次");
            String statsKey = scopedLockKey(DEADLOCK_STATS_KEY);
            String identity = UUID.nameUUIDFromBytes((victimThreadId + "\n" + generation).getBytes(StandardCharsets.UTF_8)).toString();
            long minimumId = 0;
            for (int attempt = 0; attempt < 32; attempt++) {
                String before = redissonClient.<String>getBucket(statsKey, StringCodec.INSTANCE).get();
                Map<String, Object> stats = before == null ? new HashMap<>() : decodeCacheMap(before);
                long totalDeadlocks = nonnegativeCounter(stats.getOrDefault("totalDeadlocks", 0L));
                long totalVictims = nonnegativeCounter(stats.getOrDefault("totalVictims", 0L));
                long previousId = stats.containsKey("lastEventId") ? nonnegativeCounter(stats.get("lastEventId"))
                        : Math.max(totalDeadlocks, largestEventId());
                long eventId = Math.addExact(Math.max(previousId, minimumId), 1);
                String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                stats.put("totalDeadlocks", Math.addExact(totalDeadlocks, 1));
                stats.put("totalVictims", Math.addExact(totalVictims, 1));
                stats.putIfAbsent("firstOccurrence", now);
                stats.put("lastOccurrence", now);
                stats.put("lastEventId", eventId);

                Map<String, Object> event = new HashMap<>();
                event.put("eventId", eventId);
                event.put("victimThread", victimThreadId);
                event.put("deadlockChain", new ArrayList<>(chain.nodes));
                event.put("releasedLocks", new ArrayList<>(releasedLocks));
                event.put("releasedLockCount", releasedLocks.size());
                event.put("timestamp", now);
                event.put("resolved", true);
                long recordedAt = System.currentTimeMillis();
                List<Object> keys = new ArrayList<>(List.of(scopedLockKey(DEADLOCK_VICTIM_PREFIX + eventId), statsKey,
                        scopedLockKey(DEADLOCK_IDENTITY_PREFIX + identity)));
                if (recoveryPhysicalKey != null) keys.add(recoveryPhysicalKey);
                Long outcome = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                        COMMIT_VICTIM_EVENT, RScript.ReturnType.INTEGER,
                        keys,
                        before == null ? "" : before, before == null ? "0" : "1", encodeCacheMap(event), encodeCacheMap(stats),
                        Long.toString(eventId), Long.toString(recordedAt + TimeUnit.DAYS.toMillis(7)),
                        Long.toString(recordedAt + TimeUnit.DAYS.toMillis(30)), scopedLockKey(DEADLOCK_VICTIM_PREFIX),
                        recoveryBefore == null ? "" : recoveryBefore);
                if (Long.valueOf(3).equals(outcome)) return false;
                if (Long.valueOf(2).equals(outcome)) return true;
                if (Long.valueOf(1).equals(outcome)) {
                    victimCounter.incrementAndGet();
                    log.info("[recordVictimEvent] 牺牲事件已记录, eventId={}, victim={}, releasedLocks={}", eventId, victimThreadId, releasedLocks.size());
                    return true;
                }
                if (Long.valueOf(-1).equals(outcome)) minimumId = Math.max(minimumId, largestEventId());
                else if (!Long.valueOf(0).equals(outcome)) throw new IllegalStateException("死锁事件去重记录不完整");
            }
            throw new IllegalStateException("死锁事件统计并发更新繁忙");
        } catch (Exception e) {
            throw new IllegalStateException("死锁处理事件登记失败", e);
        }
    }

    private static long nonnegativeCounter(Object value) {
        if (!(value instanceof Long || value instanceof Integer || value instanceof Short || value instanceof Byte)
                || ((Number) value).longValue() < 0) throw new IllegalStateException("死锁事件统计计数无效");
        return ((Number) value).longValue();
    }

    private long largestEventId() {
        Collection<String> keys = redisCache.keys(DEADLOCK_VICTIM_PREFIX + "*");
        long largest = 0;
        if (keys != null) for (String key : keys) largest = Math.max(largest, eventIdFromKey(key));
        return largest;
    }

    private long eventIdFromKey(String physicalKey) {
        String logical = logicalRedisKey(physicalKey, DEADLOCK_VICTIM_PREFIX);
        long id = Long.parseLong(logical.substring(DEADLOCK_VICTIM_PREFIX.length()));
        if (id <= 0) throw new IllegalStateException("死锁事件编号无效");
        return id;
    }

    @SuppressWarnings("unchecked")
    private RedisSerializer<Object> cacheSerializer() {
        return (RedisSerializer<Object>) Objects.requireNonNull(redisCache.redisTemplate.getValueSerializer());
    }

    private String encodeCacheMap(Map<String, Object> value) {
        return new String(Objects.requireNonNull(cacheSerializer().serialize(value)), StandardCharsets.UTF_8);
    }

    private Map<String, Object> decodeCacheMap(String value) {
        Object decoded = cacheSerializer().deserialize(value.getBytes(StandardCharsets.UTF_8));
        if (!(decoded instanceof Map<?, ?> source)) throw new IllegalStateException("死锁事件统计格式无效");
        Map<String, Object> result = new HashMap<>();
        for (Map.Entry<?, ?> entry : source.entrySet()) {
            if (!(entry.getKey() instanceof String key)) throw new IllegalStateException("死锁事件统计字段无效");
            result.put(key, entry.getValue());
        }
        return result;
    }

    // ==================== 辅助方法 ====================

    /**
     * 记录锁持有者
     */
    private LockInfo stampLockHolder(String lockKey, String threadId, long leaseTime) {
        String owner = redissonClient.getId() + ":" + Thread.currentThread().getId();
        String generation = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                STAMP_GENERATION, RScript.ReturnType.VALUE, List.of(scopedLockKey(lockKey)),
                owner, GENERATION_FIELD, UUID.randomUUID().toString());
        if (generation == null) throw new IllegalStateException("锁在持有记录登记前已失效");
        LockInfo previous = lockHolders.get(scopedLockKey(lockKey));
        long acquiredAt = previous != null && generation.equals(previous.generation) ? previous.acquireTime : System.currentTimeMillis();
        LockInfo info = new LockInfo(threadId, acquiredAt, leaseTime);
        info.owner = owner;
        info.generation = generation;
        return info;
    }

    private void saveLockHolder(String lockKey, LockInfo info) {
        redisCache.setCacheObject(LOCK_HOLDER_PREFIX + lockKey,
                new HashMap<>(Map.of("threadId", info.threadId, "acquireTime", info.acquireTime,
                        "owner", info.owner, "generation", info.generation, "leaseTime", info.leaseTime)),
                info.leaseTime + 10, TimeUnit.SECONDS);
    }

    /**
     * 移除锁持有者记录
     */
    private void removeLockHolder(String lockKey, LockInfo info) {
        String scoped = scopedLockKey(lockKey);
        if (info == null || info.generation == null) return;
        redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                REMOVE_GENERATION_RECORD, RScript.ReturnType.INTEGER, List.of(scopedLockKey(LOCK_HOLDER_PREFIX + lockKey)), info.generation);
        lockHolders.computeIfPresent(scoped, (key, local) -> Objects.equals(local.generation, info.generation) ? null : local);
    }

    /**
     * 记录等待者
     */
    private void recordWaiter(String lockKey, String threadId) {
        updateWaiter(lockKey, threadId, true);
    }

    /**
     * 移除等待者记录
     */
    private void removeWaiter(String lockKey, String threadId) {
        updateWaiter(lockKey, threadId, false);
    }

    private void updateWaiter(String lockKey, String threadId, boolean add) {
        updateWaiter(lockKey, threadId, add, null);
    }

    private String readWaiterStamp(String lockKey) {
        String value = redissonClient.<String>getBucket(scopedLockKey(WAITER_STAMP_PREFIX + lockKey), StringCodec.INSTANCE).get();
        return value == null ? "" : value;
    }

    private void updateWaiter(String lockKey, String threadId, boolean add, String expectedStamp) {
        // Serialize read-modify-write across clients without changing the existing Set encoding.
        RLock mutex = redissonClient.getLock(scopedLockKey(WAITER_MUTEX_PREFIX + lockKey));
        String key = LOCK_WAITER_PREFIX + lockKey;
        boolean acquired = false;
        RuntimeException failure = null;
        try {
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("等待记录更新前已中断");
            acquired = mutex.tryLock(5, TimeUnit.SECONDS);
            if (!acquired) throw new IllegalStateException("等待记录更新锁繁忙");
            String stamp = readWaiterStamp(lockKey);
            if (expectedStamp != null && !expectedStamp.equals(stamp)) return;
            Set<String> waiters = redisCache.getCacheObject(key);
            if (waiters == null) {
                if (!add) return;
                waiters = new HashSet<>();
            }
            if (add) waiters.add(threadId); else waiters.remove(threadId);
            String encoded = waiters.isEmpty() ? "" : new String(Objects.requireNonNull(cacheSerializer().serialize(waiters)), StandardCharsets.UTF_8);
            Long written = redissonClient.getScript(StringCodec.INSTANCE).eval(RScript.Mode.READ_WRITE,
                    WRITE_WAITER_STATE, RScript.ReturnType.INTEGER, List.of(scopedLockKey(key), scopedLockKey(WAITER_STAMP_PREFIX + lockKey)),
                    stamp, encoded, UUID.randomUUID().toString());
            if (!Long.valueOf(1).equals(written)) throw new IllegalStateException("等待记录已变更，请重试");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            failure = new IllegalStateException("等待记录更新被中断", interrupted);
            throw failure;
        } catch (RuntimeException error) {
            failure = error;
            throw error;
        } finally {
            if (acquired) {
                try { mutex.unlock(); }
                catch (RuntimeException cleanup) {
                    if (failure == null) throw cleanup;
                    if (cleanup != failure) failure.addSuppressed(cleanup);
                }
            }
        }
    }

    /**
     * 清理过期记录
     */
    private int cleanupExpiredRecords() {
        long now = System.currentTimeMillis();
        int removed = 0;
        for (Map.Entry<String, LockInfo> entry : currentLockHolders().entrySet()) {
            LockInfo info = entry.getValue();
            long holdTime = (now - info.acquireTime) / 1000;
            if (info.leaseTime > 0 && holdTime > info.leaseTime + 60 && !redissonClient.getLock(scopedLockKey(entry.getKey())).isLocked()) {
                removeLockHolder(entry.getKey(), info);
                removed++;
            }
        }
        return removed;
    }

    /**
     * 获取线程标识符
     */
    private String getThreadIdentifier() {
        return redissonClient.getId() + ":" + Thread.currentThread().getId();
    }

    /**
     * 发送死锁告警
     * 集成系统通知服务，发送告警到管理员
     */
    private void sendDeadlockAlert(String type, String detail, String message, String generation) {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) throw new IllegalStateException("死锁告警缺少租户上下文");
        String reference = UUID.nameUUIDFromBytes((type + "\n" + detail + "\n" + generation).getBytes(StandardCharsets.UTF_8)).toString();
        String title = "[死锁告警] " + type;
        String content = "检测类型：" + type + "\n详情：" + detail + "\n说明：" + message;
        transactions.executeWithoutResult(status -> {
            long afterUserId = 0;
            int recipients = 0;
            while (true) {
                List<Long> admins = users.selectTimerFailureAdminIds(tenantId, afterUserId, 500);
                for (Long admin : admins) {
                    sysNoticeService.send(MessageSendRequest.legacy(admin, title, content, "SYSTEM", 0L, "系统")
                            .toBuilder().bizType("WF_DEADLOCK").bizId(reference)
                            .deduplicationKey("wf:deadlock:" + reference + ":" + admin).build());
                    recipients++;
                }
                if (admins.size() < 500) break;
                afterUserId = admins.get(admins.size() - 1);
            }
            if (recipients == 0) throw new IllegalStateException("死锁告警缺少有效租户管理员");
        });
    }

    // ==================== 监控接口 ====================

    /**
     * 获取当前锁持有情况
     */
    public Map<String, Object> getLockStatistics() {
        Map<String, Object> stats = new HashMap<>();
        Map<String, LockInfo> current = currentLockHolders();
        stats.put("totalLocks", current.size());
        stats.put("locks", current.entrySet().stream()
            .map(e -> Map.of(
                "lockKey", e.getKey(),
                "holder", e.getValue().threadId,
                "holdTime", (System.currentTimeMillis() - e.getValue().acquireTime) / 1000
            ))
            .collect(Collectors.toList())
        );
        return stats;
    }

    /**
     * 手动触发死锁检测
     */
    public Map<String, Object> manualDetect() {
        List<String> timeoutLocks = detectTimeoutLocks();
        List<DeadlockChain> deadlockChains = detectCircularWaits();

        Map<String, Object> result = new HashMap<>();
        result.put("timeoutLocks", timeoutLocks);
        result.put("deadlockChains", deadlockChains.stream()
                .map(c -> c.nodes)
                .collect(Collectors.toList()));
        return result;
    }

    /**
     * 获取死锁统计数据（供监控接口调用）
     * 
     * @return 包含死锁总数、牺牲总数、最近发生时间等统计信息
     */
    public Map<String, Object> getDeadlockStats() {
        Map<String, Object> result = new HashMap<>();
        try {
            Map<String, Object> stats = redisCache.getCacheObject(DEADLOCK_STATS_KEY);
            if (stats != null) {
                result.putAll(stats);
            } else {
                result.put("totalDeadlocks", 0L);
                result.put("totalVictims", 0L);
                result.put("message", "暂无死锁记录");
            }
        } catch (Exception e) {
            result.put("error", "获取统计数据失败: " + e.getMessage());
        }
        result.put("currentLockCount", currentLockHolders().size());
        result.put("victimCounterLocal", victimCounter.get());
        return result;
    }

    /**
     * 获取最近的牺牲事件记录（供监控接口调用）
     * 
     * @param limit 返回记录数量上限
     * @return 最近的牺牲事件列表
     */
    public List<Map<String, Object>> getRecentVictimEvents(int limit) {
        List<Map<String, Object>> events = new ArrayList<>();
        scopedLockKey("");
        int boundedLimit = Math.min(limit, workflowProperties.getLock().getMaxVictimRecords());
        if (boundedLimit <= 0) return events;
        try {
            Collection<String> keys = redisCache.keys(DEADLOCK_VICTIM_PREFIX + "*");
            if (keys == null || keys.isEmpty()) {
                return events;
            }

            // 按 eventId 倒序取最近的记录
            List<String> sortedKeys = keys.stream()
                    .sorted(Comparator.comparingLong(this::eventIdFromKey).reversed())
                    // 从配置读取最大牺牲记录数（sys.workflow.lock.maxVictimRecords）
                    .limit(boundedLimit)
                    .collect(Collectors.toList());

            for (String physicalKey : sortedKeys) {
                String key = logicalRedisKey(physicalKey, DEADLOCK_VICTIM_PREFIX);
                Map<String, Object> event = redisCache.getCacheObject(key);
                if (event != null) {
                    events.add(event);
                }
            }
        } catch (Exception e) {
            log.warn("[getRecentVictimEvents] 获取牺牲事件失败: {}", e.getMessage());
        }
        return events;
    }

    // ==================== 内部类 ====================

    private record RecoveryLock(String key, String owner, String generation) { }
    private record RecoveryPlan(String victim, List<String> chain, List<RecoveryLock> locks,
                                Map<String, String> waiters, int nextLock, List<String> released) { }

    /**
     * 锁信息
     */
    private static class LockInfo {
        String threadId;
        long acquireTime;
        long leaseTime;
        String owner;
        String generation;

        LockInfo(String threadId, long acquireTime, long leaseTime) {
            this.threadId = threadId;
            this.acquireTime = acquireTime;
            this.leaseTime = leaseTime;
        }
    }

    /**
     * 死锁链
     */
    private static class DeadlockChain {
        List<String> nodes;

        DeadlockChain(List<String> nodes) {
            this.nodes = new ArrayList<>(nodes);
        }
    }
}

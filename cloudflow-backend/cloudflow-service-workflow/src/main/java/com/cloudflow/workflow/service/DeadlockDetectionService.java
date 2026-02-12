package com.cloudflow.workflow.service;

import com.cloudflow.common.core.utils.RedisCache;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

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

    /** 锁超时阈值（秒），超过此时间未释放视为可能死锁 */
    private static final int LOCK_TIMEOUT_THRESHOLD = 60;

    /** 死锁牺牲记录前缀 */
    private static final String DEADLOCK_VICTIM_PREFIX = "sys:deadlock:victim:";

    /** 死锁牺牲统计前缀 */
    private static final String DEADLOCK_STATS_KEY = "sys:deadlock:stats";

    /** 最大牺牲记录保留数量 */
    private static final int MAX_VICTIM_RECORDS = 100;

    /** 内存中的锁持有记录（用于快速检测） */
    private final Map<String, LockInfo> lockHolders = new ConcurrentHashMap<>();

    /** 死锁牺牲计数器 */
    private final AtomicLong victimCounter = new AtomicLong(0);

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private RedisCache redisCache;

    // ==================== 核心 API ====================

    /**
     * 安全获取锁（带死锁检测）
     * 
     * 使用方式：替换原有的 redissonClient.getLock().tryLock()
     * 
     * @param lockKey 锁的 key
     * @param waitTime 等待时间（秒）
     * @param leaseTime 锁持有时间（秒）
     * @return 是否成功获取锁
     */
    public boolean tryLockWithDetection(String lockKey, long waitTime, long leaseTime) {
        String threadId = getThreadIdentifier();
        
        try {
            // 1. 记录等待状态
            recordWaiter(lockKey, threadId);

            // 2. 尝试获取锁
            RLock lock = redissonClient.getLock(lockKey);
            boolean acquired = lock.tryLock(waitTime, leaseTime, TimeUnit.SECONDS);

            if (acquired) {
                // 3. 记录锁持有者
                recordLockHolder(lockKey, threadId, leaseTime);
                // 4. 清除等待记录
                removeWaiter(lockKey, threadId);
                return true;
            } else {
                // 5. 获取失败，清除等待记录
                removeWaiter(lockKey, threadId);
                log.warn("[tryLockWithDetection] 获取锁失败, lockKey={}, threadId={}", lockKey, threadId);
                return false;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            removeWaiter(lockKey, threadId);
            log.error("[tryLockWithDetection] 获取锁被中断, lockKey={}, threadId={}", lockKey, threadId);
            return false;
        } catch (Exception e) {
            removeWaiter(lockKey, threadId);
            log.error("[tryLockWithDetection] 获取锁异常, lockKey={}, error={}", lockKey, e.getMessage());
            return false;
        }
    }

    /**
     * 安全释放锁（带清理）
     */
    public void unlockWithDetection(String lockKey) {
        String threadId = getThreadIdentifier();
        
        try {
            RLock lock = redissonClient.getLock(lockKey);
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
                removeLockHolder(lockKey, threadId);
                log.debug("[unlockWithDetection] 锁已释放, lockKey={}, threadId={}", lockKey, threadId);
            }
        } catch (Exception e) {
            log.error("[unlockWithDetection] 释放锁异常, lockKey={}, error={}", lockKey, e.getMessage());
        }
    }

    // ==================== 死锁检测机制 ====================

    /**
     * 定时检测死锁
     * 每 30 秒执行一次
     * 使用分布式锁防止多实例重复执行
     */
    @Scheduled(fixedDelay = 30000)
    public void detectDeadlocks() {
        String lockKey = "lock:scheduled:detectDeadlocks";
        RLock lock = redissonClient.getLock(lockKey);
        
        try {
            // 尝试获取锁，最多等待1秒，锁定25秒后自动释放
            if (lock.tryLock(1, 25, TimeUnit.SECONDS)) {
                try {
                    // 1. 检测超时锁
                    List<String> timeoutLocks = detectTimeoutLocks();
                    if (!timeoutLocks.isEmpty()) {
                        log.warn("[detectDeadlocks] 发现 {} 个超时锁", timeoutLocks.size());
                        handleTimeoutLocks(timeoutLocks);
                    }

                    // 2. 检测循环等待
                    List<DeadlockChain> deadlockChains = detectCircularWaits();
                    if (!deadlockChains.isEmpty()) {
                        log.error("[detectDeadlocks] 发现 {} 个死锁链", deadlockChains.size());
                        handleDeadlockChains(deadlockChains);
                    }

                    // 3. 清理过期记录
                    cleanupExpiredRecords();
                } finally {
                    lock.unlock();
                }
            } else {
                log.debug("[detectDeadlocks] 未能获取分布式锁，跳过本次检测");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[detectDeadlocks] 获取分布式锁被中断");
        } catch (Exception e) {
            log.error("[detectDeadlocks] 死锁检测异常: {}", e.getMessage());
        }
    }

    /**
     * 检测超时锁
     */
    private List<String> detectTimeoutLocks() {
        List<String> timeoutLocks = new ArrayList<>();
        long now = System.currentTimeMillis();

        for (Map.Entry<String, LockInfo> entry : lockHolders.entrySet()) {
            LockInfo info = entry.getValue();
            long holdTime = (now - info.acquireTime) / 1000;

            if (holdTime > LOCK_TIMEOUT_THRESHOLD) {
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
        for (String waiter : waitGraph.keySet()) {
            Set<String> visited = new HashSet<>();
            List<String> path = new ArrayList<>();
            
            if (hasCycle(waiter, waitGraph, visited, path)) {
                chains.add(new DeadlockChain(path));
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
        
        for (String key : waiterKeys) {
            String lockKey = key.substring(LOCK_WAITER_PREFIX.length());
            Set<String> waiters = redisCache.getCacheObject(key);
            
            if (waiters != null) {
                LockInfo holder = lockHolders.get(lockKey);
                if (holder != null) {
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
    private void handleTimeoutLocks(List<String> timeoutLocks) {
        for (String lockKey : timeoutLocks) {
            try {
                RLock lock = redissonClient.getLock(lockKey);
                
                // 强制释放锁（谨慎操作）
                if (lock.isLocked()) {
                    lock.forceUnlock();
                    log.warn("[handleTimeoutLocks] 强制释放超时锁, lockKey={}", lockKey);
                }

                // 清理记录
                removeLockHolder(lockKey, null);

                // TODO: 发送告警通知
                sendDeadlockAlert("超时锁", lockKey, "锁持有时间超过 " + LOCK_TIMEOUT_THRESHOLD + " 秒");
            } catch (Exception e) {
                log.error("[handleTimeoutLocks] 处理超时锁失败, lockKey={}, error={}", lockKey, e.getMessage());
            }
        }
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
    private void handleDeadlockChains(List<DeadlockChain> chains) {
        for (DeadlockChain chain : chains) {
            try {
                // 1. 选择牺牲者（持有锁时间最短的线程，回滚代价最小）
                String victim = selectVictim(chain);
                log.error("[handleDeadlockChains] 检测到死锁，选定牺牲线程: {}, 死锁链: {}", victim, chain.nodes);

                // 2. 执行牺牲策略：强制释放牺牲者持有的所有锁
                List<String> releasedLocks = forceReleaseVictimLocks(victim);

                // 3. 清理牺牲者的所有等待记录
                cleanupVictimWaiters(victim);

                // 4. 记录牺牲事件到 Redis（供监控和审计查询）
                recordVictimEvent(victim, chain, releasedLocks);

                // 5. 发送告警通知
                sendDeadlockAlert("循环等待-已自动恢复",
                        String.join(" -> ", chain.nodes),
                        String.format("死锁已解除，牺牲线程: %s，释放锁: %d 个", victim, releasedLocks.size()));

                log.warn("[handleDeadlockChains] 死锁已自动恢复，牺牲线程: {}, 释放锁数量: {}", victim, releasedLocks.size());
            } catch (Exception e) {
                log.error("[handleDeadlockChains] 处理死锁链失败, chain={}, error={}", chain.nodes, e.getMessage(), e);
                // 处理失败时仍然发送告警，确保运维人员知晓
                sendDeadlockAlert("循环等待-自动恢复失败",
                        String.join(" -> ", chain.nodes),
                        "死锁自动恢复失败: " + e.getMessage());
            }
        }
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

            for (Map.Entry<String, LockInfo> entry : lockHolders.entrySet()) {
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
    private List<String> forceReleaseVictimLocks(String victimThreadId) {
        List<String> releasedLocks = new ArrayList<>();

        // 遍历所有锁持有记录，找到牺牲者持有的锁
        Iterator<Map.Entry<String, LockInfo>> iterator = lockHolders.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, LockInfo> entry = iterator.next();
            if (entry.getValue().threadId.equals(victimThreadId)) {
                String lockKey = entry.getKey();
                try {
                    // 强制释放 Redisson 分布式锁
                    RLock lock = redissonClient.getLock(lockKey);
                    if (lock.isLocked()) {
                        lock.forceUnlock();
                        log.warn("[forceReleaseVictimLocks] 强制释放锁, lockKey={}, victim={}", lockKey, victimThreadId);
                    }

                    // 清理 Redis 中的锁持有记录
                    redisCache.deleteObject(LOCK_HOLDER_PREFIX + lockKey);

                    releasedLocks.add(lockKey);
                } catch (Exception e) {
                    log.error("[forceReleaseVictimLocks] 释放锁失败, lockKey={}, error={}", lockKey, e.getMessage());
                }

                // 从内存记录中移除
                iterator.remove();
            }
        }

        return releasedLocks;
    }

    /**
     * 清理牺牲者的所有等待记录
     * 
     * @param victimThreadId 牺牲者线程标识
     */
    private void cleanupVictimWaiters(String victimThreadId) {
        try {
            Collection<String> waiterKeys = redisCache.keys(LOCK_WAITER_PREFIX + "*");
            if (waiterKeys == null) {
                return;
            }

            for (String key : waiterKeys) {
                try {
                    Set<String> waiters = redisCache.getCacheObject(key);
                    if (waiters != null && waiters.remove(victimThreadId)) {
                        if (waiters.isEmpty()) {
                            redisCache.deleteObject(key);
                        } else {
                            redisCache.setCacheObject(key, waiters, 120, TimeUnit.SECONDS);
                        }
                    }
                } catch (Exception e) {
                    log.warn("[cleanupVictimWaiters] 清理等待记录失败, key={}, error={}", key, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.warn("[cleanupVictimWaiters] 获取等待记录 keys 失败: {}", e.getMessage());
        }
    }

    /**
     * 记录牺牲事件到 Redis（供监控和审计）
     * 
     * @param victimThreadId 牺牲者线程标识
     * @param chain 死锁链
     * @param releasedLocks 被释放的锁列表
     */
    private void recordVictimEvent(String victimThreadId, DeadlockChain chain, List<String> releasedLocks) {
        try {
            long eventId = victimCounter.incrementAndGet();
            String eventKey = DEADLOCK_VICTIM_PREFIX + eventId;

            Map<String, Object> event = new HashMap<>();
            event.put("eventId", eventId);
            event.put("victimThread", victimThreadId);
            event.put("deadlockChain", chain.nodes);
            event.put("releasedLocks", releasedLocks);
            event.put("releasedLockCount", releasedLocks.size());
            event.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            event.put("resolved", true);

            // 牺牲事件保留 7 天
            redisCache.setCacheObject(eventKey, event, 7 * 24 * 60, TimeUnit.MINUTES);

            // 更新统计计数
            updateDeadlockStats();

            log.info("[recordVictimEvent] 牺牲事件已记录, eventId={}, victim={}, releasedLocks={}",
                    eventId, victimThreadId, releasedLocks.size());
        } catch (Exception e) {
            log.warn("[recordVictimEvent] 记录牺牲事件失败: {}", e.getMessage());
        }
    }

    /**
     * 更新死锁统计数据
     */
    private void updateDeadlockStats() {
        try {
            Map<String, Object> stats = redisCache.getCacheObject(DEADLOCK_STATS_KEY);
            if (stats == null) {
                stats = new HashMap<>();
                stats.put("totalDeadlocks", 0L);
                stats.put("totalVictims", 0L);
                stats.put("firstOccurrence", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            }

            // 递增计数
            long totalDeadlocks = ((Number) stats.getOrDefault("totalDeadlocks", 0L)).longValue() + 1;
            long totalVictims = ((Number) stats.getOrDefault("totalVictims", 0L)).longValue() + 1;

            stats.put("totalDeadlocks", totalDeadlocks);
            stats.put("totalVictims", totalVictims);
            stats.put("lastOccurrence", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

            // 统计数据保留 30 天
            redisCache.setCacheObject(DEADLOCK_STATS_KEY, stats, 30 * 24 * 60, TimeUnit.MINUTES);
        } catch (Exception e) {
            log.warn("[updateDeadlockStats] 更新统计数据失败: {}", e.getMessage());
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 记录锁持有者
     */
    private void recordLockHolder(String lockKey, String threadId, long leaseTime) {
        LockInfo info = new LockInfo(threadId, System.currentTimeMillis(), leaseTime);
        lockHolders.put(lockKey, info);

        // 同时记录到 Redis（用于跨实例监控）
        try {
            redisCache.setCacheObject(
                LOCK_HOLDER_PREFIX + lockKey,
                Map.of("threadId", threadId, "acquireTime", info.acquireTime),
                (int) leaseTime + 10,
                TimeUnit.SECONDS
            );
        } catch (Exception e) {
            log.warn("[recordLockHolder] 记录到 Redis 失败: {}", e.getMessage());
        }
    }

    /**
     * 移除锁持有者记录
     */
    private void removeLockHolder(String lockKey, String threadId) {
        lockHolders.remove(lockKey);
        try {
            redisCache.deleteObject(LOCK_HOLDER_PREFIX + lockKey);
        } catch (Exception e) {
            // ignore
        }
    }

    /**
     * 记录等待者
     */
    private void recordWaiter(String lockKey, String threadId) {
        String key = LOCK_WAITER_PREFIX + lockKey;
        try {
            Set<String> waiters = redisCache.getCacheObject(key);
            if (waiters == null) {
                waiters = new HashSet<>();
            }
            waiters.add(threadId);
            redisCache.setCacheObject(key, waiters, 120, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("[recordWaiter] 记录等待者失败: {}", e.getMessage());
        }
    }

    /**
     * 移除等待者记录
     */
    private void removeWaiter(String lockKey, String threadId) {
        String key = LOCK_WAITER_PREFIX + lockKey;
        try {
            Set<String> waiters = redisCache.getCacheObject(key);
            if (waiters != null) {
                waiters.remove(threadId);
                if (waiters.isEmpty()) {
                    redisCache.deleteObject(key);
                } else {
                    redisCache.setCacheObject(key, waiters, 120, TimeUnit.SECONDS);
                }
            }
        } catch (Exception e) {
            // ignore
        }
    }

    /**
     * 清理过期记录
     */
    private void cleanupExpiredRecords() {
        long now = System.currentTimeMillis();
        
        lockHolders.entrySet().removeIf(entry -> {
            LockInfo info = entry.getValue();
            long holdTime = (now - info.acquireTime) / 1000;
            return holdTime > info.leaseTime + 60; // 超过租约时间 + 缓冲时间
        });
    }

    /**
     * 获取线程标识符
     */
    private String getThreadIdentifier() {
        return Thread.currentThread().getName() + "-" + Thread.currentThread().getId();
    }

    /**
     * 发送死锁告警
     */
    private void sendDeadlockAlert(String type, String detail, String message) {
        // TODO: 集成告警系统（钉钉、邮件、短信等）
        log.error("[DEADLOCK ALERT] type={}, detail={}, message={}", type, detail, message);
    }

    // ==================== 监控接口 ====================

    /**
     * 获取当前锁持有情况
     */
    public Map<String, Object> getLockStatistics() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalLocks", lockHolders.size());
        stats.put("locks", lockHolders.entrySet().stream()
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
        result.put("currentLockCount", lockHolders.size());
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
        try {
            Collection<String> keys = redisCache.keys(DEADLOCK_VICTIM_PREFIX + "*");
            if (keys == null || keys.isEmpty()) {
                return events;
            }

            // 按 eventId 倒序取最近的记录
            List<String> sortedKeys = keys.stream()
                    .sorted(Comparator.reverseOrder())
                    .limit(Math.min(limit, MAX_VICTIM_RECORDS))
                    .collect(Collectors.toList());

            for (String key : sortedKeys) {
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

    /**
     * 锁信息
     */
    private static class LockInfo {
        String threadId;
        long acquireTime;
        long leaseTime;

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

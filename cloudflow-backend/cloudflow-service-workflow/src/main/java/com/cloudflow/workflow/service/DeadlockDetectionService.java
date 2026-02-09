package com.cloudflow.workflow.service;

import com.cloudflow.common.core.utils.RedisCache;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
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

    /** 内存中的锁持有记录（用于快速检测） */
    private final Map<String, LockInfo> lockHolders = new ConcurrentHashMap<>();

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
     */
    @Scheduled(fixedDelay = 30000)
    public void detectDeadlocks() {
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
        Set<String> waiterKeys = redisCache.keys(LOCK_WAITER_PREFIX + "*");
        
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
     */
    private void handleDeadlockChains(List<DeadlockChain> chains) {
        for (DeadlockChain chain : chains) {
            // 选择牺牲者（通常选择链中的第一个）
            String victim = chain.nodes.get(0);
            
            log.error("[handleDeadlockChains] 检测到死锁，牺牲线程: {}, 死锁链: {}", victim, chain.nodes);

            // TODO: 实现牺牲策略（例如中断线程、释放锁等）
            // 这里只记录日志，实际处理需要根据业务场景定制

            // 发送告警
            sendDeadlockAlert("循环等待", String.join(" -> ", chain.nodes), "检测到死锁链");
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

        return Map.of(
            "timeoutLocks", timeoutLocks,
            "deadlockChains", deadlockChains.stream()
                .map(c -> c.nodes)
                .collect(Collectors.toList())
        );
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

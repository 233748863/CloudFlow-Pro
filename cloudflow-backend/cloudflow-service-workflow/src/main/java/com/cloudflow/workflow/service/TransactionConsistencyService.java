package com.cloudflow.workflow.service;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import com.cloudflow.workflow.mapper.WfTransactionMessageMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Objects;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * R.4: 数据一致性保证服务
 * 
 * 轻量化方案：本地消息表 + 定时重试 + 最终一致性
 * 
 * 设计思路：
 * 1. 本地消息表模式：业务操作和消息写入在同一个本地事务中完成
 * 2. 定时任务轮询：定时扫描未完成的消息，进行重试
 * 3. 最终一致性：通过重试机制保证最终一致性
 * 4. 幂等性保证：每个操作都有唯一的消息ID，支持幂等重试
 * 
 * 相比 Seata 的优势：
 * - 无需引入额外中间件
 * - 不依赖 TC（事务协调器）
 * - 性能开销极小
 * - 实现简单，易于维护
 * 
 * @author CloudFlow
 */
@Service
public class TransactionConsistencyService {

    private static final Logger log = LoggerFactory.getLogger(TransactionConsistencyService.class);

    /** 兜底默认值：最大重试次数（实际值从 sys.workflow.maxRetryCount 读取） */
    private static final int DEFAULT_MAX_RETRY = 5;

    /** 兜底默认值：重试间隔基数秒（实际值从 sys.workflow.retryBaseInterval 读取，采用指数退避） */
    private static final int RETRY_BASE_INTERVAL = 30;

    @Autowired
    private WfTransactionMessageMapper messageMapper;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    @Autowired
    private org.springframework.beans.factory.ObjectProvider<WorkflowTriggerService> triggerService;

    @Autowired
    private TransactionTemplate transactions;

    private int maxRetry() {
        return sysConfigHelper.getConfigInt("sys.workflow.maxRetryCount", DEFAULT_MAX_RETRY);
    }

    private int retryBaseInterval() {
        return sysConfigHelper.getConfigInt("sys.workflow.retryBaseInterval", RETRY_BASE_INTERVAL);
    }

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ==================== 核心 API ====================

    /**
     * 在本地事务中记录一条待处理消息
     * 
     * 使用方式：在业务方法中调用此方法，与业务操作在同一个事务中
     * 如果业务操作回滚，消息也会回滚，保证一致性
     * 
     * @param businessType 业务类型
     * @param businessId   业务ID
     * @param content      消息内容（JSON）
     * @return 消息ID
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String recordMessage(String businessType, String businessId, String content) {
        WfTransactionMessage msg = new WfTransactionMessage();
        msg.setMessageId(UUID.randomUUID().toString());
        msg.setBusinessType(businessType);
        msg.setBusinessId(businessId);
        msg.setContent(content);
        msg.setStatus("PENDING");
        msg.setRetryCount(0);
        msg.setMaxRetryCount(maxRetry());
        msg.setNextRetryTime(LocalDateTime.now());
        msg.setCreateTime(LocalDateTime.now());
        msg.setUpdateTime(LocalDateTime.now());

        messageMapper.insert(msg);
        log.debug("[recordMessage] 消息已记录, messageId={}, type={}, businessId={}", 
            msg.getMessageId(), businessType, businessId);
        return msg.getMessageId();
    }

    /**
     * 在本地事务中记录消息，并附带额外数据
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String recordMessage(String businessType, String businessId, Map<String, Object> data) {
        try {
            String content = objectMapper.writeValueAsString(data);
            return recordMessage(businessType, businessId, content);
        } catch (Exception e) {
            log.error("[recordMessage] 序列化消息内容失败: {}", e.getMessage());
            return recordMessage(businessType, businessId, "{}");
        }
    }

    /**
     * 标记消息为成功
     */
    public void markSuccess(String messageId) {
        WfTransactionMessage msg = messageMapper.selectById(messageId);
        if (msg != null) {
            msg.setStatus("SUCCESS");
            msg.setUpdateTime(LocalDateTime.now());
            messageMapper.updateById(msg);
            log.debug("[markSuccess] 消息标记成功, messageId={}", messageId);
        }
    }

    /**
     * 标记消息为失败
     */
    public void markFailed(String messageId, String errorMessage) {
        WfTransactionMessage msg = messageMapper.selectById(messageId);
        if (msg != null) {
            msg.setStatus("FAILED");
            msg.setErrorMessage(errorMessage);
            msg.setUpdateTime(LocalDateTime.now());
            messageMapper.updateById(msg);
            log.warn("[markFailed] 消息标记失败, messageId={}, error={}", messageId, errorMessage);
        }
    }

    /**
     * 执行带一致性保证的操作
     * 
     * 使用方式：
     * <pre>
     * transactionConsistencyService.executeWithConsistency(
     *     "PROCESS_START",
     *     instanceId,
     *     Map.of("processKey", processKey),
     *     () -> {
     *         // 你的业务逻辑
     *         return result;
     *     }
     * );
     * </pre>
     * 
     * @param businessType 业务类型
     * @param businessId   业务ID
     * @param data         消息数据
     * @param action       业务操作
     * @return 操作结果
     */
    @Transactional(rollbackFor = Exception.class)
    public <T> T executeWithConsistency(String businessType, String businessId, 
                                         Map<String, Object> data, Supplier<T> action) {
        // 1. 幂等性检查：防止重复执行
        String idempotentKey = "sys:txn:idempotent:" + businessType + ":" + businessId;
        String existing = redisCache.getCacheObject(idempotentKey);
        if (existing != null) {
            log.info("[executeWithConsistency] 幂等检查命中, type={}, businessId={}", businessType, businessId);
            return null; // 已执行过，跳过
        }

        // 2. 记录消息（与业务操作在同一事务中）
        String messageId = recordMessage(businessType, businessId, data);

        try {
            // 3. 执行业务操作
            T result = action.get();

            // 4. 标记消息成功
            markSuccess(messageId);

            // 5. 设置幂等标记（5分钟过期）
            try {
                redisCache.setCacheObject(idempotentKey, messageId, 5, TimeUnit.MINUTES);
            } catch (Exception e) {
                log.warn("[executeWithConsistency] 设置幂等标记失败: {}", e.getMessage());
            }

            return result;
        } catch (Exception e) {
            // 业务操作失败，事务回滚，消息也会回滚
            log.error("[executeWithConsistency] 业务操作失败, type={}, businessId={}, error={}", 
                businessType, businessId, e.getMessage());
            throw e; // 重新抛出，让事务回滚
        }
    }

    // ==================== 定时重试机制 ====================

    /**
     * 定时扫描并重试失败的消息
     * 每 60 秒执行一次
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "transaction-retry-job", lockTime = 55)
    @JobHandler(value = "txnConsistencyScan", desc = "事务一致性扫描")
    public JobResult retryPendingMessages() {
        String lockKey = "lock:scheduled:retryPendingMessages";
        RLock lock = redissonClient.getLock(lockKey);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return skipped("事务消息重试已有任务执行，已跳过");
            LocalDateTime observedAt = LocalDateTime.now();
            List<RuntimeException> failures = new ArrayList<>();
            String afterId = "";
            int processed = 0;
            while (true) {
                String cursor = afterId;
                List<WfTransactionMessage> pendingMessages;
                try {
                    pendingMessages = TenantBroker.applyWithoutTenant(ignored -> messageMapper.selectRetryCandidates(cursor, observedAt, 100));
                } catch (RuntimeException failure) {
                    failures.add(failure);
                    break;
                }
                for (WfTransactionMessage message : pendingMessages) {
                    try {
                        if (message.getTenantId() == null) throw new IllegalStateException("事务消息缺少租户");
                        if (TenantBroker.applyAs(message.getTenantId(), ignored -> doRetryMessage(message))) processed++;
                    } catch (RuntimeException failure) {
                        failures.add(new IllegalStateException("事务消息重试失败，消息：" + message.getMessageId(), failure));
                    }
                }
                if (pendingMessages.size() < 100) break;
                String next = pendingMessages.get(pendingMessages.size() - 1).getMessageId();
                if (next == null || next.compareTo(afterId) <= 0) throw new IllegalStateException("事务消息重试分页未前进");
                afterId = next;
            }
            if (!failures.isEmpty()) {
                IllegalStateException failure = new IllegalStateException("事务消息重试存在失败项：" + failures.size() + "项；已处理" + processed + "条");
                failures.forEach(failure::addSuppressed);
                throw failure;
            }
            return JobResult.success(processed, "事务消息重试完成：处理" + processed + "条");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("事务消息重试获取锁被中断", e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    /**
     * 重试单条消息
     * 使用指数退避策略
     */
    @Async("workflowExecutor")
    public void retryMessage(WfTransactionMessage msg) {
        // @Async 线程无 HTTP/Sa-Token 上下文；按消息自身 tenantId 切租户后再执行。
        TenantBroker.runAs(msg.getTenantId(), tid -> doRetryMessage(msg));
    }

    private boolean doRetryMessage(WfTransactionMessage msg) {
        if (WorkflowTriggerService.BUSINESS_TYPE.equals(msg.getBusinessType())) {
            return triggerService.getObject().processForScan(msg);
        }
        String lockKey = "lock:txn:retry:" + msg.getMessageId();
        RLock lock = redissonClient.getLock(lockKey);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(0, TimeUnit.SECONDS);
            if (!acquired) return false;
            TransactionTemplate itemTransaction = new TransactionTemplate(Objects.requireNonNull(transactions.getTransactionManager()));
            itemTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            RetryAttempt result = Objects.requireNonNull(itemTransaction.execute(status -> retryUnsupportedMessage(msg)));
            if (result.failure() != null) throw result.failure();
            return result.processed();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("事务消息获取重试锁被中断", interrupted);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private record RetryAttempt(boolean processed, RuntimeException failure) { }

    private RetryAttempt retryUnsupportedMessage(WfTransactionMessage pointer) {
        WfTransactionMessage message = messageMapper.selectForRetry(pointer.getTenantId(), pointer.getMessageId());
        LocalDateTime now = LocalDateTime.now();
        if (message == null || !Objects.equals(message.getTenantId(), pointer.getTenantId())
                || !"PENDING".equals(message.getStatus()) || message.getNextRetryTime() == null
                || message.getNextRetryTime().isAfter(now)) return new RetryAttempt(false, null);
        if (WorkflowTriggerService.BUSINESS_TYPE.equals(message.getBusinessType())) {
            throw new IllegalStateException("事务消息业务类型已改变，等待重新扫描");
        }
        RuntimeException failure = new IllegalStateException("事务消息类型没有可执行的补偿处理器");
        int attempts = message.getRetryCount() == null ? 0 : message.getRetryCount();
        int maximum = message.getMaxRetryCount() == null ? 0 : message.getMaxRetryCount();
        if (attempts < 0 || maximum <= 0) throw new IllegalStateException("事务消息重试次数配置无效");
        if (attempts < maximum) attempts++;
        message.setRetryCount(attempts);
        message.setErrorMessage(failure.getMessage());
        message.setUpdateTime(now);
        if (attempts >= maximum) {
            message.setStatus("FAILED");
        } else {
            int base = retryBaseInterval();
            if (base <= 0 || attempts >= 63) throw new IllegalStateException("事务消息重试间隔配置无效");
            message.setNextRetryTime(now.plusSeconds(Math.multiplyExact((long) base, 1L << attempts)));
        }
        if (messageMapper.updateById(message) != 1) throw new IllegalStateException("事务消息重试状态保存冲突");
        return new RetryAttempt(true, failure);
    }

    // ==================== 监控和管理 ====================

    /**
     * 获取消息统计信息
     */
    public Map<String, Object> getMessageStatistics() {
        Long pending = messageMapper.selectCount(
            new LambdaQueryWrapper<WfTransactionMessage>().eq(WfTransactionMessage::getStatus, "PENDING"));
        Long processing = messageMapper.selectCount(
            new LambdaQueryWrapper<WfTransactionMessage>().eq(WfTransactionMessage::getStatus, "PROCESSING"));
        Long success = messageMapper.selectCount(
            new LambdaQueryWrapper<WfTransactionMessage>().eq(WfTransactionMessage::getStatus, "SUCCESS"));
        Long failed = messageMapper.selectCount(
            new LambdaQueryWrapper<WfTransactionMessage>().eq(WfTransactionMessage::getStatus, "FAILED"));

        return Map.of(
            "pending", pending != null ? pending : 0,
            "processing", processing != null ? processing : 0,
            "success", success != null ? success : 0,
            "failed", failed != null ? failed : 0,
            "total", (pending != null ? pending : 0) + (processing != null ? processing : 0) 
                     + (success != null ? success : 0) + (failed != null ? failed : 0)
        );
    }

    /**
     * 清理已成功的历史消息（保留最近7天）
     * 每天凌晨2点执行
     * 使用分布式锁防止多实例重复执行
     */
    @DistributedJob(name = "transaction-cleanup-job", lockTime = 120)
    @JobHandler(value = "txnConsistencyDaily", desc = "事务一致性清理")
    public JobResult cleanupSuccessMessages() {
        String lockKey = "lock:scheduled:cleanupSuccessMessages";
        RLock lock = redissonClient.getLock(lockKey);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(1, TimeUnit.SECONDS);
            if (!acquired) return skipped("事务消息清理已有任务执行，已跳过");
            LocalDateTime sevenDaysAgo = LocalDateTime.now().minusDays(7);
            int deleted = TenantBroker.applyWithoutTenant(ignored -> messageMapper.delete(
                    new LambdaQueryWrapper<WfTransactionMessage>().eq(WfTransactionMessage::getStatus, "SUCCESS")
                            .lt(WfTransactionMessage::getUpdateTime, sevenDaysAgo)));
            return JobResult.success(deleted, "事务消息清理完成：删除" + deleted + "条七天前的成功记录");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("事务消息清理获取锁被中断", e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private static JobResult skipped(String message) {
        return JobResult.builder().executeStatus("SKIPPED").affectedRows(0).resultMsg(message).build();
    }

    /**
     * 手动重试指定消息
     */
    public boolean manualRetry(String messageId) {
        WfTransactionMessage msg = messageMapper.selectById(messageId);
        if (msg == null) {
            return false;
        }
        
        msg.setRetryCount(0);
        msg.setStatus("PENDING");
        msg.setNextRetryTime(LocalDateTime.now());
        msg.setMaxRetryCount(maxRetry());
        msg.setUpdateTime(LocalDateTime.now());
        messageMapper.updateById(msg);
        
        log.info("[manualRetry] 手动重试消息, messageId={}", messageId);
        return true;
    }
}

package com.cloudflow.common.job.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.config.JobExecutionStore;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.model.JobStatusVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import com.cloudflow.common.core.utils.LogSanitizer;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.net.InetAddress;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

/**
 * 各业务服务共用的异步任务执行接口。
 */
@Service
@ConditionalOnProperty(name = "cloudflow.job.service-endpoints", havingValue = "true", matchIfMissing = true)
public class JobExecutionService {
    private final JobHandlerRegistry registry;
    private final JobExecutionStore executionStore;
    private final RedissonClient redissonClient;
    private final JobReportClient reportClient;
    private final Executor jobTaskExecutor;

    public JobExecutionService(JobHandlerRegistry registry,
                                  JobExecutionStore executionStore,
                                  RedissonClient redissonClient,
                                  JobReportClient reportClient,
                                  @Qualifier("jobHandlerExecutor") Executor jobTaskExecutor) {
        this.registry = registry;
        this.executionStore = executionStore;
        this.redissonClient = redissonClient;
        this.reportClient = reportClient;
        this.jobTaskExecutor = jobTaskExecutor;
    }

    @Value("${spring.application.name:cloudflow-service}")
    private String serviceName;

    @Value("${spring.cloud.nacos.discovery.ip:${spring.cloud.client.ip-address:}}")
    private String instanceAddress;

    public R<JobAcceptVO> execute(JobExecuteDTO request) {
        return execute(request, false);
    }

    public R<JobAcceptVO> executeInline(JobExecuteDTO request) {
        return execute(request, true);
    }

    private R<JobAcceptVO> execute(JobExecuteDTO request, boolean synchronous) {
        if (request == null || !StringUtils.hasText(request.getExecuteNo())
                || !StringUtils.hasText(request.getHandlerName()) || !registry.contains(request.getHandlerName())) {
            return R.ok(new JobAcceptVO(false, request == null ? null : request.getExecuteNo(), "HANDLER_NOT_REGISTERED"));
        }
        JobResult running = JobResult.builder().executeStatus("RUNNING").build();
        Duration ttl = executionTtl(request);
        // set-if-absent 是 executeNo 的原子接收凭证，避免并发重投在 get/put 间隙重复执行。
        if (!executionStore.putIfAbsent(request.getExecuteNo(), running, ttl)) {
            JobResult existing = executionStore.get(request.getExecuteNo());
            if (existing != null && "SKIPPED".equals(existing.getExecuteStatus())) {
                return R.ok(new JobAcceptVO(false, request.getExecuteNo(), "LOCK_HELD"));
            }
            return R.ok(new JobAcceptVO(true, request.getExecuteNo(), null));
        }

        RLock lock = null;
        Long lockOwnerId = null;
        if (!Integer.valueOf(1).equals(request.getConcurrentFlag())) {
            lock = redissonClient.getLock("cloudflow:job:lock:" + registry.lockName(request.getHandlerName()));
            lockOwnerId = lockOwnerId(request.getExecuteNo());
            boolean locked;
            try {
                locked = lock.tryLockAsync(0,
                                Math.max(1, request.getLockTimeSeconds() == null ? 300 : request.getLockTimeSeconds()),
                                TimeUnit.SECONDS, lockOwnerId)
                        .toCompletableFuture().join();
            } catch (RuntimeException e) {
                executionStore.remove(request.getExecuteNo());
                throw e;
            }
            if (!locked) {
                executionStore.put(request.getExecuteNo(),
                        JobResult.builder().executeStatus("SKIPPED").resultMsg("LOCK_HELD").build(), ttl);
                return R.ok(new JobAcceptVO(false, request.getExecuteNo(), "LOCK_HELD"));
            }
        }

        RLock acquiredLock = lock;
        Long acquiredOwnerId = lockOwnerId;
        if (synchronous) {
            executeRegistered(request, acquiredLock, acquiredOwnerId);
        } else {
            try {
                jobTaskExecutor.execute(() -> executeRegistered(request, acquiredLock, acquiredOwnerId));
            } catch (RuntimeException e) {
                try {
                    executionStore.remove(request.getExecuteNo());
                } finally {
                    unlock(acquiredLock, acquiredOwnerId);
                }
                return R.ok(new JobAcceptVO(false, request.getExecuteNo(), "EXECUTOR_REJECTED"));
            }
        }
        return R.ok(new JobAcceptVO(true, request.getExecuteNo(), null));
    }

    public R<JobStatusVO> status(String executeNo) {
        JobResult result = executionStore.get(executeNo);
        if (result == null) return R.ok(null);
        return R.ok(new JobStatusVO(executeNo, result.getExecuteStatus(), result.getAffectedRows(),
                result.getResultMsg(), result.getExceptionStack(), result.getDurationMs()));
    }

    private void executeRegistered(JobExecuteDTO request, RLock lock, Long lockOwnerId) {
        try {
            long started = System.currentTimeMillis();
            JobResult result;
            try {
                result = JobInvocationContext.callWithPlatformLock(request,
                        () -> registry.invoke(request.getHandlerName(), request.getHandlerParam()));
            } catch (Exception e) {
                result = JobResult.failed("任务执行失败");
                result.setExceptionStack(stackTrace(e));
            }
            if (result == null) {
                result = JobResult.failed("任务未返回执行结果");
            }
            if (result.getExecuteStatus() == null) {
                result.setExecuteStatus("SUCCESS");
            }
            result.setResultMsg(limit(result.getResultMsg(), 1000));
            result.setExceptionStack(limit(result.getExceptionStack(), 60000));
            result.setDurationMs(System.currentTimeMillis() - started);
            executionStore.put(request.getExecuteNo(), result, executionTtl(request));
            JobResultReportDTO report = new JobResultReportDTO();
            report.setExecuteNo(request.getExecuteNo());
            report.setExecuteStatus(result.getExecuteStatus());
            report.setAffectedRows(result.getAffectedRows());
            report.setResultMsg(result.getResultMsg());
            report.setExceptionStack(result.getExceptionStack());
            report.setDurationMs(result.getDurationMs());
            report.setExecutorIp(localAddress());
            reportClient.reportResult(report);
        } finally {
            unlock(lock, lockOwnerId);
        }
    }

    private String localAddress() {
        if (StringUtils.hasText(instanceAddress)) {
            return instanceAddress.trim();
        }
        try {
            return InetAddress.getLocalHost().getHostAddress();
        } catch (Exception ignored) {
            return null;
        }
    }

    private Duration executionTtl(JobExecuteDTO request) {
        long timeoutSeconds = request == null || request.getTimeoutSeconds() == null
                ? 1800L : Math.max(1L, request.getTimeoutSeconds());
        return Duration.ofSeconds(timeoutSeconds * 2L);
    }

    private long lockOwnerId(String executeNo) {
        try {
            return UUID.fromString(executeNo).getLeastSignificantBits();
        } catch (IllegalArgumentException ignored) {
            return ((long) executeNo.hashCode() << 32) ^ executeNo.length();
        }
    }

    private void unlock(RLock lock, Long ownerId) {
        if (lock == null || ownerId == null) {
            return;
        }
        try {
            lock.unlockAsync(ownerId).toCompletableFuture().join();
        } catch (RuntimeException ignored) {
            // 锁已到期时仅当前逻辑 owner 失效，不强制释放其他执行新取得的锁。
        }
    }

    private String stackTrace(Throwable throwable) {
        StringWriter buffer = new StringWriter();
        throwable.printStackTrace(new PrintWriter(buffer));
        return limit(LogSanitizer.text(buffer.toString()), 60000);
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}

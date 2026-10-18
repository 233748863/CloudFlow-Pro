package com.cloudflow.common.job.config;

import java.util.concurrent.Callable;
import com.cloudflow.common.job.model.JobExecuteDTO;

/**
 * 标记当前调用已由任务执行入口管理分布式锁。
 *
 * <p>平台执行入口需要在返回 HTTP 响应前决定是否接收任务，因此锁在入口处获取；
 * 进入原有 {@code @DistributedJob} 切面时只继续业务调用，避免同一次执行重复抢两把锁。</p>
 */
public final class JobInvocationContext {
    private static final ThreadLocal<Execution> EXECUTION = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> PLATFORM_LOCK_MANAGED =
            ThreadLocal.withInitial(() -> Boolean.FALSE);

    private JobInvocationContext() {
    }

    public record Execution(Long jobId, String executeNo, String handlerName) { }

    public static Execution execution() { return EXECUTION.get(); }

    public static <Result> Result callWithPlatformLock(JobExecuteDTO request, Callable<Result> callable) throws Exception {
        Execution previous = EXECUTION.get();
        EXECUTION.set(new Execution(request.getJobId(), request.getExecuteNo(), request.getHandlerName()));
        try { return callWithPlatformLock(callable); }
        finally {
            if (previous == null) EXECUTION.remove();
            else EXECUTION.set(previous);
        }
    }

    /** 仅允许最外层 Handler 的切面消费一次，嵌套任务仍按自身注解加锁。 */
    public static boolean consumePlatformLock() {
        if (!Boolean.TRUE.equals(PLATFORM_LOCK_MANAGED.get())) {
            return false;
        }
        PLATFORM_LOCK_MANAGED.set(Boolean.FALSE);
        return true;
    }

    public static <T> T callWithPlatformLock(Callable<T> callable) throws Exception {
        Boolean previous = PLATFORM_LOCK_MANAGED.get();
        PLATFORM_LOCK_MANAGED.set(Boolean.TRUE);
        try {
            return callable.call();
        } finally {
            if (Boolean.TRUE.equals(previous)) {
                PLATFORM_LOCK_MANAGED.set(Boolean.TRUE);
            } else {
                PLATFORM_LOCK_MANAGED.remove();
            }
        }
    }
}

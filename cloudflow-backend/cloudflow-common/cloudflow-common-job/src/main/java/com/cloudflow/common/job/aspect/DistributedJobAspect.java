package com.cloudflow.common.job.aspect;

import com.cloudflow.common.job.annotation.DistributedJob;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

import java.util.concurrent.TimeUnit;

/**
 * 分布式定时任务 AOP 切面
 * 拦截 @DistributedJob 注解标注的方法，使用 Redisson 分布式锁确保多实例只执行一次
 *
 * @author CloudFlow
 */
@Slf4j
@Aspect
@RequiredArgsConstructor
public class DistributedJobAspect {

    /**
     * 分布式锁 key 前缀
     */
    private static final String LOCK_KEY_PREFIX = "cloudflow:job:lock:";

    private final RedissonClient redissonClient;

    /**
     * 环绕通知：在执行定时任务前尝试获取分布式锁
     * 获取到锁才执行任务，获取不到则跳过（说明其他实例正在执行）
     */
    @Around("@annotation(distributedJob)")
    public Object around(ProceedingJoinPoint joinPoint, DistributedJob distributedJob) throws Throwable {
        // 获取任务名称
        String jobName = distributedJob.name();
        if (jobName.isEmpty()) {
            // 默认使用 类名:方法名
            MethodSignature signature = (MethodSignature) joinPoint.getSignature();
            jobName = signature.getDeclaringType().getSimpleName() + ":" + signature.getName();
        }

        String lockKey = LOCK_KEY_PREFIX + jobName;
        RLock lock = redissonClient.getLock(lockKey);

        boolean acquired = false;
        try {
            // 尝试获取分布式锁
            acquired = lock.tryLock(distributedJob.waitTime(), distributedJob.lockTime(), TimeUnit.SECONDS);
            if (acquired) {
                log.info("定时任务 [{}] 获取锁成功，开始执行", jobName);
                long startTime = System.currentTimeMillis();
                Object result = joinPoint.proceed();
                long costTime = System.currentTimeMillis() - startTime;
                log.info("定时任务 [{}] 执行完成，耗时 {} ms", jobName, costTime);
                return result;
            } else {
                log.debug("定时任务 [{}] 获取锁失败，跳过执行（其他实例正在执行）", jobName);
                return null;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("定时任务 [{}] 获取锁被中断", jobName, e);
            return null;
        } catch (Exception e) {
            log.error("定时任务 [{}] 执行异常", jobName, e);
            throw e;
        } finally {
            // 释放锁
            if (acquired && lock.isHeldByCurrentThread()) {
                try {
                    lock.unlock();
                } catch (Exception e) {
                    log.warn("定时任务 [{}] 释放锁异常", jobName, e);
                }
            }
        }
    }
}

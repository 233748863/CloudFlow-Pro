package com.cloudflow.common.redis.lock;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.spel.MethodBasedSpelEvaluator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

/**
 * 分布式锁 AOP 切面。拦截 @DistributedLock 注解方法，基于 Redisson RLock 实现。
 * <p>
 * 线程模型：每次方法调用独立获取锁，方法返回/异常后自动释放（try-finally）。
 */
@Slf4j
@Aspect
@RequiredArgsConstructor
public class DistributedLockAspect {

    private final RedissonClient redissonClient;

    @Around("@annotation(distributedLock)")
    public Object around(ProceedingJoinPoint joinPoint, DistributedLock distributedLock) throws Throwable {
        String resolvedKey = resolveLockKey(joinPoint, distributedLock.key());
        String finalKey = buildFinalKey(distributedLock, resolvedKey);
        RLock lock = distributedLock.fair() ? redissonClient.getFairLock(finalKey) : redissonClient.getLock(finalKey);
        boolean acquired = false;
        try {
            acquired = lock.tryLock(distributedLock.waitMs(), distributedLock.leaseMs(), TimeUnit.MILLISECONDS);
            if (!acquired) {
                log.warn("获取分布式锁失败: key={}, waitMs={}", finalKey, distributedLock.waitMs());
                throw new ServiceException(distributedLock.message(), distributedLock.errorCode());
            }
            log.debug("获取分布式锁成功: key={}", finalKey);
            return joinPoint.proceed();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServiceException(distributedLock.message(), distributedLock.errorCode(), e);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.debug("释放分布式锁: key={}", finalKey);
            }
        }
    }

    private String resolveLockKey(ProceedingJoinPoint joinPoint, String keyExpression) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        String resolvedKey = MethodBasedSpelEvaluator.evaluateToString(keyExpression, method, joinPoint.getArgs(), joinPoint.getTarget());
        if (resolvedKey == null || resolvedKey.isEmpty()) {
            throw new IllegalArgumentException("@DistributedLock key 解析为空: " + keyExpression);
        }
        return resolvedKey;
    }

    private String buildFinalKey(DistributedLock distributedLock, String resolvedKey) {
        String prefix = distributedLock.keyPrefix();
        if (distributedLock.includeTenant()) {
            Long tenantId = UserContext.getTenantId();
            if (tenantId != null) {
                return tenantId + ":" + prefix + ":" + resolvedKey;
            }
        }
        return prefix + ":" + resolvedKey;
    }
}

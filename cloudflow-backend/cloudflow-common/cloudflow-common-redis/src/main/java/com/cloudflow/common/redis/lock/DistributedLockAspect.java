package com.cloudflow.common.redis.lock;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.core.DefaultParameterNameDiscoverer;
import org.springframework.expression.EvaluationContext;
import org.springframework.expression.Expression;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.StandardEvaluationContext;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

/**
 * 分布式锁 AOP 切面。拦截 @DistributedLock 注解方法，基于 Redisson RLock 实现。
 * <p>
 * 线程模型：每次方法调用独立获取锁，方法返回/异常后自动释放（try-finally）。
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class DistributedLockAspect {

    private final RedissonClient redissonClient;
    private final ExpressionParser parser = new SpelExpressionParser();
    private final DefaultParameterNameDiscoverer discoverer = new DefaultParameterNameDiscoverer();

    @Around("@annotation(distributedLock)")
    public Object around(ProceedingJoinPoint joinPoint, DistributedLock distributedLock) throws Throwable {
        String lockKey = resolveLockKey(joinPoint, distributedLock.key());
        RLock lock = redissonClient.getLock(lockKey);

        boolean acquired = false;
        try {
            acquired = lock.tryLock(distributedLock.waitMs(), distributedLock.leaseMs(), TimeUnit.MILLISECONDS);
            if (!acquired) {
                log.warn("获取分布式锁失败: key={}, waitMs={}", lockKey, distributedLock.waitMs());
                throw new ServiceException("ERR.CONCURRENT", 409);
            }
            log.debug("获取分布式锁成功: key={}", lockKey);
            return joinPoint.proceed();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServiceException("ERR.CONCURRENT", 409);
        } finally {
            if (acquired && lock.isHeldByCurrentThread()) {
                lock.unlock();
                log.debug("释放分布式锁: key={}", lockKey);
            }
        }
    }

    private String resolveLockKey(ProceedingJoinPoint joinPoint, String keyExpression) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        Object[] args = joinPoint.getArgs();

        // SpEL 上下文
        EvaluationContext context = new StandardEvaluationContext();
        String[] paramNames = discoverer.getParameterNames(method);
        if (paramNames != null) {
            for (int i = 0; i < paramNames.length; i++) {
                context.setVariable(paramNames[i], args[i]);
            }
        }

        Expression expression = parser.parseExpression(keyExpression);
        String resolvedKey = expression.getValue(context, String.class);
        if (resolvedKey == null || resolvedKey.isEmpty()) {
            throw new IllegalArgumentException("@DistributedLock key 解析为空: " + keyExpression);
        }

        // 拼租户前缀（若有）
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            return tenantId + ":lock:" + resolvedKey;
        }
        return "lock:" + resolvedKey;
    }
}

package com.cloudflow.common.idempotent.aspectj;

import cn.hutool.core.util.ObjectUtil;
import cn.hutool.crypto.SecureUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Duration;

/**
 * 防重复提交 AOP 切面
 * <p>
 * 原理：根据 用户ID + 请求URI + 请求参数摘要 生成唯一 Key，
 * 在 Redis 中设置带过期时间的标记，如果标记已存在则拒绝请求。
 * <p>
 * 参考 RuoYi-Cloud-Plus 的 RepeatSubmitAspect 设计，
 * 适配 CloudFlow 的 UserContext 和 RedisTemplate。
 *
 * @author CloudFlow
 */
@Aspect
public class RepeatSubmitAspect {

    private static final Logger log = LoggerFactory.getLogger(RepeatSubmitAspect.class);

    /** Redis Key 前缀 */
    private static final String REPEAT_SUBMIT_KEY = "cloudflow:repeat_submit:";

    private final StringRedisTemplate redisTemplate;

    public RepeatSubmitAspect(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    /**
     * 前置通知：在方法执行前检查是否重复提交
     *
     * @param joinPoint    切入点
     * @param repeatSubmit 注解实例
     */
    @Before("@annotation(repeatSubmit)")
    public void doBefore(JoinPoint joinPoint, RepeatSubmit repeatSubmit) {
        // 计算间隔时间（统一转为毫秒）
        long intervalMillis = repeatSubmit.timeUnit().toMillis(repeatSubmit.interval());
        if (intervalMillis < 1000) {
            // 最小间隔 1 秒，防止配置错误
            intervalMillis = 1000;
        }

        // 构建唯一 Key
        String key = buildKey(joinPoint);

        // 尝试在 Redis 中设置标记（SET NX + EX 原子操作）
        Boolean success = redisTemplate.opsForValue()
                .setIfAbsent(key, "1", Duration.ofMillis(intervalMillis));

        if (Boolean.FALSE.equals(success)) {
            // Key 已存在，说明在间隔时间内重复提交
            log.warn("[RepeatSubmit] 检测到重复提交, key={}", key);
            throw new RepeatSubmitException(repeatSubmit.message());
        }

        log.debug("[RepeatSubmit] 防重标记已设置, key={}, interval={}ms", key, intervalMillis);
    }

    /**
     * 构建防重复提交的 Redis Key
     * 格式: cloudflow:repeat_submit:{userId}:{uri}:{paramsMd5}
     */
    private String buildKey(JoinPoint joinPoint) {
        // 获取当前请求
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            throw new RepeatSubmitException("无法获取请求上下文");
        }
        HttpServletRequest request = attributes.getRequest();

        Long currentUserId = UserContext.getUserId();
        String userId = currentUserId != null ? String.valueOf(currentUserId) : "anonymous";

        // 请求 URI
        String uri = request.getRequestURI();

        // 请求参数摘要（使用方法参数的 hashCode 生成 MD5）
        String paramsDigest = "";
        Object[] args = joinPoint.getArgs();
        if (args != null && args.length > 0) {
            StringBuilder sb = new StringBuilder();
            for (Object arg : args) {
                if (arg != null && !(arg instanceof HttpServletRequest)
                        && !(arg instanceof jakarta.servlet.http.HttpServletResponse)) {
                    sb.append(arg.hashCode());
                }
            }
            paramsDigest = SecureUtil.md5(sb.toString());
        }

        return REPEAT_SUBMIT_KEY + userId + ":" + uri + ":" + paramsDigest;
    }

    /**
     * 重复提交异常
     * 使用 RuntimeException 以便被全局异常处理器捕获
     */
    public static class RepeatSubmitException extends RuntimeException {
        public RepeatSubmitException(String message) {
            super(message);
        }
    }
}

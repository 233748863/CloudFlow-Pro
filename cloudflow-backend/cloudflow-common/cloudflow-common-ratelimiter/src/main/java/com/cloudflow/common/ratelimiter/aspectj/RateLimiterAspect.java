package com.cloudflow.common.ratelimiter.aspectj;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

/**
 * 接口限流 AOP 切面
 * <p>
 * 使用 Redis Lua 脚本实现原子性的计数器限流。
 * 参考 RuoYi-Cloud-Plus 的 RateLimiterAspect 设计。
 *
 * @author CloudFlow
 */
@Aspect
public class RateLimiterAspect {

    private static final Logger log = LoggerFactory.getLogger(RateLimiterAspect.class);

    private static final String RATE_LIMIT_KEY = "cloudflow:rate_limit:";

    private final StringRedisTemplate redisTemplate;
    private final RedisScript<Long> limitScript;

    public RateLimiterAspect(StringRedisTemplate redisTemplate, RedisScript<Long> limitScript) {
        this.redisTemplate = redisTemplate;
        this.limitScript = limitScript;
    }

    @Before("@annotation(rateLimiter)")
    public void doBefore(JoinPoint joinPoint, RateLimiter rateLimiter) {
        int time = rateLimiter.time();
        int count = rateLimiter.count();

        String key = buildKey(joinPoint, rateLimiter);
        List<String> keys = Collections.singletonList(key);

        try {
            Long result = redisTemplate.execute(limitScript, keys,
                    String.valueOf(count), String.valueOf(time));

            if (result == null || result == 0L) {
                log.warn("[RateLimiter] 触发限流, key={}, count={}, time={}s", key, count, time);
                throw new RateLimitException(rateLimiter.message());
            }

            log.debug("[RateLimiter] 限流检查通过, key={}, current<={}", key, count);
        } catch (RateLimitException e) {
            throw e;
        } catch (Exception e) {
            log.error("[RateLimiter] 限流脚本执行异常, key={}: {}", key, e.getMessage());
            // Redis 异常时放行，不影响正常业务
        }
    }

    private String buildKey(JoinPoint joinPoint, RateLimiter rateLimiter) {
        StringBuilder sb = new StringBuilder(RATE_LIMIT_KEY);

        // 自定义 Key 前缀
        if (StringUtils.hasText(rateLimiter.key())) {
            sb.append(rateLimiter.key());
        } else {
            // 默认使用 类名:方法名
            MethodSignature signature = (MethodSignature) joinPoint.getSignature();
            Method method = signature.getMethod();
            sb.append(method.getDeclaringClass().getSimpleName())
              .append(":")
              .append(method.getName());
        }

        // 根据限流类型追加维度
        LimitType limitType = rateLimiter.limitType();
        if (limitType == LimitType.IP) {
            sb.append(":").append(getIpAddr());
        } else if (limitType == LimitType.USER) {
            sb.append(":").append(getUserId());
        }

        return sb.toString();
    }

    private String getIpAddr() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                String ip = request.getHeader("X-Forwarded-For");
                if (!StringUtils.hasText(ip) || "unknown".equalsIgnoreCase(ip)) {
                    ip = request.getHeader("X-Real-IP");
                }
                if (!StringUtils.hasText(ip) || "unknown".equalsIgnoreCase(ip)) {
                    ip = request.getRemoteAddr();
                }
                // 多级代理取第一个
                if (ip != null && ip.contains(",")) {
                    ip = ip.split(",")[0].trim();
                }
                return ip != null ? ip : "unknown";
            }
        } catch (Exception e) {
            log.warn("[RateLimiter] 获取IP失败: {}", e.getMessage());
        }
        return "unknown";
    }

    private String getUserId() {
        try {
            Long userId = UserContext.getUserId();
            if (userId != null) {
                return String.valueOf(userId);
            }
        } catch (Exception e) {
            log.warn("[RateLimiter] 获取用户ID失败: {}", e.getMessage());
        }
        return "anonymous";
    }

    /**
     * 限流异常
     */
    public static class RateLimitException extends RuntimeException {
        public RateLimitException(String message) {
            super(message);
        }
    }
}

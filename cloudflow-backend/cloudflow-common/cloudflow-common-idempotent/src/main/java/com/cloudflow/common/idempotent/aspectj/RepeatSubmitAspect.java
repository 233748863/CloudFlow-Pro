package com.cloudflow.common.idempotent.aspectj;

import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.idempotent.config.IdempotentProperties;
import com.cloudflow.common.idempotent.support.RepeatSubmitKeyResolver;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.OutputStream;
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

    private final StringRedisTemplate redisTemplate;
    private final SysConfigHelper sysConfigHelper;
    private final IdempotentProperties properties;
    private final RepeatSubmitKeyResolver keyResolver;

    public RepeatSubmitAspect(StringRedisTemplate redisTemplate,
                              ObjectMapper objectMapper,
                              SysConfigHelper sysConfigHelper,
                              IdempotentProperties properties) {
        this.redisTemplate = redisTemplate;
        this.sysConfigHelper = sysConfigHelper;
        this.properties = properties;
        this.keyResolver = new RepeatSubmitKeyResolver(objectMapper);
    }

    /**
     * 前置通知：在方法执行前检查是否重复提交
     *
     * @param joinPoint    切入点
     * @param repeatSubmit 注解实例
     */
    @Before("@annotation(repeatSubmit)")
    public void doBefore(JoinPoint joinPoint, RepeatSubmit repeatSubmit) {
        if (!properties.isEnabled() || !repeatSubmit.enabled()) {
            return;
        }
        long intervalMillis = repeatSubmit.timeUnit().toMillis(repeatSubmit.interval());
        long minInterval = sysConfigHelper.getConfigLong("sys.common.repeatSubmit.intervalMillis", properties.getMinIntervalMillis());
        if (intervalMillis < minInterval) {
            intervalMillis = minInterval;
        }

        HttpServletRequest request = currentRequest();
        String prefix = repeatSubmit.keyPrefix().isBlank() ? properties.getKeyPrefix() : repeatSubmit.keyPrefix();
        String key = keyResolver.resolve(prefix, joinPoint, repeatSubmit, request);

        Boolean success = redisTemplate.opsForValue()
                .setIfAbsent(key, "1", Duration.ofMillis(intervalMillis));

        if (Boolean.FALSE.equals(success)) {
            log.warn("[RepeatSubmit] 检测到重复提交, key={}", key);
            throw new ServiceException(repeatSubmit.message(), ErrorCodeConstants.REPEAT_SUBMIT);
        }

        log.debug("[RepeatSubmit] 防重标记已设置, key={}, interval={}ms", key, intervalMillis);
    }

    private HttpServletRequest currentRequest() {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            throw new ServiceException("无法获取请求上下文", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
        }
        return attributes.getRequest();
    }
}

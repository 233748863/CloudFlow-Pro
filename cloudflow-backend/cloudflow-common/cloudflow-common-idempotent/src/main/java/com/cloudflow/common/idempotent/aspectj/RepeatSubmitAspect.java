package com.cloudflow.common.idempotent.aspectj;

import cn.hutool.crypto.SecureUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
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
import java.lang.reflect.Array;
import java.time.Duration;
import java.time.temporal.Temporal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

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
    private final ObjectMapper objectMapper;
    private final SysConfigHelper sysConfigHelper;

    public RepeatSubmitAspect(StringRedisTemplate redisTemplate, ObjectMapper objectMapper, SysConfigHelper sysConfigHelper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper.copy();
        this.objectMapper.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
        this.objectMapper.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
        this.sysConfigHelper = sysConfigHelper;
    }

    /**
     * 前置通知：在方法执行前检查是否重复提交
     *
     * @param joinPoint    切入点
     * @param repeatSubmit 注解实例
     */
    @Before("@annotation(repeatSubmit)")
    public void doBefore(JoinPoint joinPoint, RepeatSubmit repeatSubmit) {
        long intervalMillis = repeatSubmit.timeUnit().toMillis(repeatSubmit.interval());
        long minInterval = sysConfigHelper.getConfigLong("sys.common.repeatSubmit.intervalMillis", 1000L);
        if (intervalMillis < minInterval) {
            intervalMillis = minInterval;
        }

        String key = buildKey(joinPoint);

        Boolean success = redisTemplate.opsForValue()
                .setIfAbsent(key, "1", Duration.ofMillis(intervalMillis));

        if (Boolean.FALSE.equals(success)) {
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
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            throw new RepeatSubmitException("无法获取请求上下文");
        }
        HttpServletRequest request = attributes.getRequest();

        Long currentUserId = UserContext.getUserId();
        String userId = currentUserId != null ? String.valueOf(currentUserId) : "anonymous";
        String uri = request.getRequestURI();
        String paramsDigest = buildParamsDigest(joinPoint.getArgs());

        return REPEAT_SUBMIT_KEY + userId + ":" + uri + ":" + paramsDigest;
    }

    private String buildParamsDigest(Object[] args) {
        if (args == null || args.length == 0) {
            return "";
        }

        List<Object> normalizedArgs = new ArrayList<>();
        for (Object arg : args) {
            if (isIgnoredArgument(arg)) {
                continue;
            }
            normalizedArgs.add(normalizeValue(arg));
        }

        if (normalizedArgs.isEmpty()) {
            return "";
        }

        try {
            return SecureUtil.md5(objectMapper.writeValueAsString(normalizedArgs));
        } catch (Exception e) {
            throw new RepeatSubmitException("生成防重参数摘要失败");
        }
    }

    private Object normalizeValue(Object value) {
        if (value == null) {
            return null;
        }
        if (isSimpleValue(value)) {
            return value;
        }
        if (value instanceof Map<?, ?> map) {
            TreeMap<String, Object> normalizedMap = new TreeMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() == null || isIgnoredArgument(entry.getValue())) {
                    continue;
                }
                normalizedMap.put(String.valueOf(entry.getKey()), normalizeValue(entry.getValue()));
            }
            return normalizedMap;
        }
        if (value instanceof Collection<?> collection) {
            List<Object> normalizedList = new ArrayList<>();
            for (Object item : collection) {
                if (isIgnoredArgument(item)) {
                    continue;
                }
                normalizedList.add(normalizeValue(item));
            }
            return normalizedList;
        }
        if (value.getClass().isArray()) {
            List<Object> normalizedArray = new ArrayList<>();
            int length = Array.getLength(value);
            for (int i = 0; i < length; i++) {
                Object item = Array.get(value, i);
                if (isIgnoredArgument(item)) {
                    continue;
                }
                normalizedArray.add(normalizeValue(item));
            }
            return normalizedArray;
        }
        return normalizeValue(objectMapper.convertValue(value, Object.class));
    }

    private boolean isIgnoredArgument(Object arg) {
        if (arg == null) {
            return false;
        }
        return arg instanceof ServletRequest
                || arg instanceof ServletResponse
                || arg instanceof MultipartFile
                || arg instanceof InputStream
                || arg instanceof OutputStream;
    }

    private boolean isSimpleValue(Object value) {
        return value instanceof CharSequence
                || value instanceof Number
                || value instanceof Boolean
                || value instanceof Character
                || value instanceof Enum<?>
                || value instanceof UUID
                || value instanceof Date
                || value instanceof Temporal;
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

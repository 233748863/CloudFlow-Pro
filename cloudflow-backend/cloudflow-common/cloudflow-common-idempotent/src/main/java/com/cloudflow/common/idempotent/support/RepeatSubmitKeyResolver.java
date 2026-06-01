package com.cloudflow.common.idempotent.support;

import cn.hutool.crypto.SecureUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.spel.MethodBasedSpelEvaluator;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.time.temporal.Temporal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

/**
 * RepeatSubmit key 生成器。
 */
public class RepeatSubmitKeyResolver {

    private final ObjectMapper objectMapper;

    public RepeatSubmitKeyResolver(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.copy();
        this.objectMapper.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
        this.objectMapper.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    }

    public String resolve(String prefix, JoinPoint joinPoint, RepeatSubmit repeatSubmit, HttpServletRequest request) {
        List<String> keyParts = new ArrayList<>();
        keyParts.add(prefix);
        if (repeatSubmit.includeTenant()) {
            keyParts.add("tenant:" + nullable(UserContext.getTenantId(), "default"));
        }
        if (repeatSubmit.includeUser()) {
            keyParts.add("user:" + nullable(UserContext.getUserId(), "anonymous"));
        }
        if (repeatSubmit.includeUri() && request != null) {
            keyParts.add("uri:" + request.getRequestURI());
        }
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();
        keyParts.add("method:" + method.getDeclaringClass().getName() + "#" + method.getName());
        if (!repeatSubmit.key().isBlank()) {
            String customKey = MethodBasedSpelEvaluator.evaluateToString(repeatSubmit.key(), method, joinPoint.getArgs(), joinPoint.getTarget());
            if (customKey == null || customKey.isBlank()) {
                throw new ServiceException("幂等 Key 解析结果为空", ErrorCodeConstants.INTERNAL_SERVER_ERROR);
            }
            keyParts.add("custom:" + customKey);
        } else if (repeatSubmit.includeArgs()) {
            keyParts.add("args:" + buildParamsDigest(joinPoint.getArgs()));
        }
        return String.join(":", keyParts);
    }

    private String buildParamsDigest(Object[] args) {
        if (args == null || args.length == 0) {
            return "none";
        }
        List<Object> normalizedArgs = new ArrayList<>();
        for (Object arg : args) {
            if (isIgnoredArgument(arg)) {
                continue;
            }
            normalizedArgs.add(normalizeValue(arg));
        }
        if (normalizedArgs.isEmpty()) {
            return "none";
        }
        try {
            return SecureUtil.md5(objectMapper.writeValueAsString(normalizedArgs));
        } catch (Exception e) {
            throw new ServiceException("生成幂等参数摘要失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, e);
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

    private String nullable(Object value, String defaultValue) {
        return value == null ? defaultValue : String.valueOf(value);
    }
}

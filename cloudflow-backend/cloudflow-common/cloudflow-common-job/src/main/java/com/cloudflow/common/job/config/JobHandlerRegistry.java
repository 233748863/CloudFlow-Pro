package com.cloudflow.common.job.config;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.model.HandlerInfo;
import com.cloudflow.common.job.model.JobResult;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 集中任务 Handler 注册表。只暴露显式标注的安全白名单方法。
 */
@Component
public class JobHandlerRegistry {
    private final ApplicationContext context;
    private final Map<String, RegisteredHandler> handlers = new ConcurrentHashMap<>();

    public JobHandlerRegistry(ApplicationContext context) {
        this.context = context;
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void refresh() {
        handlers.clear();
        for (String beanName : context.getBeanDefinitionNames()) {
            Object bean;
            try {
                bean = context.getBean(beanName);
            } catch (Exception ignored) {
                continue;
            }
            Class<?> targetClass = AopUtils.getTargetClass(bean);
            for (Method method : targetClass.getMethods()) {
                JobHandler annotation = AnnotationUtils.findAnnotation(method, JobHandler.class);
                if (annotation != null && StringUtils.hasText(annotation.value())) {
                    RegisteredHandler candidate = new RegisteredHandler(bean, method, annotation.desc());
                    RegisteredHandler previous = handlers.putIfAbsent(annotation.value(), candidate);
                    if (previous != null && (!previous.method().equals(method)
                            || previous.bean() != bean)) {
                        throw new IllegalStateException("重复的任务 Handler: " + annotation.value());
                    }
                }
            }
        }
    }

    public List<HandlerInfo> list() {
        ensureLoaded();
        List<HandlerInfo> result = new ArrayList<>();
        handlers.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .forEach(entry -> result.add(new HandlerInfo(entry.getKey(), entry.getValue().description())));
        return Collections.unmodifiableList(result);
    }

    public boolean contains(String name) {
        ensureLoaded();
        return handlers.containsKey(name);
    }

    /** 返回与原有 @DistributedJob 一致的锁名，未标注时使用 Handler 名。 */
    public String lockName(String name) {
        ensureLoaded();
        RegisteredHandler handler = handlers.get(name);
        if (handler == null) {
            throw new IllegalArgumentException("未注册的任务 Handler: " + name);
        }
        DistributedJob annotation = AnnotationUtils.findAnnotation(handler.method(), DistributedJob.class);
        if (annotation == null || !StringUtils.hasText(annotation.name())) {
            return name;
        }
        return annotation.name();
    }

    public JobResult invoke(String name, String param) throws Exception {
        ensureLoaded();
        RegisteredHandler handler = handlers.get(name);
        if (handler == null) {
            throw new IllegalArgumentException("未注册的任务 Handler: " + name);
        }
        try {
            Object value;
            if (handler.method().getParameterCount() == 0) {
                value = handler.method().invoke(handler.bean());
            } else if (handler.method().getParameterCount() == 1
                    && handler.method().getParameterTypes()[0].equals(String.class)) {
                value = handler.method().invoke(handler.bean(), param);
            } else {
                throw new IllegalArgumentException("Handler 参数签名不受支持: " + name);
            }
            if (value == null) return JobResult.success(null, "任务执行完成");
            if (value instanceof JobResult result) return result;
            if (value instanceof Number number) return JobResult.success(number.intValue(), "任务执行完成");
            return JobResult.success(null, String.valueOf(value));
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            throw new RuntimeException(cause.getMessage(), cause);
        }
    }

    private void ensureLoaded() {
        if (handlers.isEmpty()) {
            refresh();
        }
    }

    private record RegisteredHandler(Object bean, Method method, String description) {
    }
}

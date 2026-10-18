package com.cloudflow.common.core.utils;

import com.cloudflow.common.core.context.TraceContext;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.annotation.Annotation;
import org.slf4j.Logger;
import org.springframework.aop.support.AopUtils;
import org.springframework.core.annotation.MergedAnnotation;
import org.springframework.core.annotation.MergedAnnotations;
import org.springframework.util.ReflectionUtils;
import org.springframework.validation.BindingResult;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

import java.lang.reflect.Method;
import java.util.Objects;
import java.util.stream.Collectors;

public final class SensitiveLogPolicy {
    private static final String SYS_LOG = "com.cloudflow.common.log.annotation.SysLog";
    private static final String SENSITIVE_REQUEST = SensitiveLogPolicy.class.getName() + ".sensitive";

    private SensitiveLogPolicy() {
    }

    public static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest() : null;
    }

    public static boolean isSensitive(HttpServletRequest request) {
        return isSensitive(request, request == null ? null : request.getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE));
    }

    public static boolean isSensitive(HttpServletRequest request, Object handler) {
        if (request != null && Boolean.TRUE.equals(request.getAttribute(SENSITIVE_REQUEST))) {
            return true;
        }
        boolean sensitive = handler instanceof HandlerMethod method && isSensitive(method.getMethod(), method.getBeanType())
                || workflowPath(request) != null || portalPath(request) != null || previewPath(request) != null
                || downloadPath(request) != null || oauthPath(request) != null || imPath(request) != null;
        if (sensitive && request != null) {
            request.setAttribute(SENSITIVE_REQUEST, true);
        }
        return sensitive;
    }

    public static boolean isSensitive(Method method, Class<?> targetClass) {
        Method specificMethod = AopUtils.getMostSpecificMethod(method, targetClass);
        return disablesParameters(specificMethod) || disablesParameters(method);
    }

    private static boolean disablesParameters(Method method) {
        MergedAnnotation<Annotation> annotation = MergedAnnotations.from(method, MergedAnnotations.SearchStrategy.TYPE_HIERARCHY).get(SYS_LOG);
        return annotation.isPresent() && !annotation.getBoolean("logParams");
    }

    public static void logRequest(Logger logger, HttpServletRequest request) {
        request.removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
        logger.info("敏感请求: traceId={}, path={}", TraceContext.currentOrCreate(), requestPath(request));
    }

    public static boolean logException(Logger logger, Throwable exception, Object code) {
        return logException(logger, currentRequest(), exception, code);
    }

    public static boolean logException(Logger logger, HttpServletRequest request, Throwable exception, Object code) {
        if (!isSensitive(request)) {
            return false;
        }
        request.removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
        logger.warn("敏感请求失败: traceId={}, path={}, code={}, type={}",
                TraceContext.currentOrCreate(), requestPath(request), safeCode(code), exception.getClass().getSimpleName());
        return true;
    }

    public static String requestPath(HttpServletRequest request) {
        String downloadPath = downloadPath(request);
        if (downloadPath != null) return downloadPath;
        String imPath = imPath(request);
        if (imPath != null) return imPath;
        String oauthPath = oauthPath(request);
        if (oauthPath != null) return oauthPath;
        Object pattern = request == null ? null : request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern != null) {
            return LogSanitizer.limit(pattern.toString(), 500);
        }
        String previewPath = previewPath(request);
        if (previewPath != null) return previewPath;
        String workflowPath = workflowPath(request);
        return workflowPath == null ? portalPath(request) == null ? "<unresolved>" : portalPath(request) : workflowPath;
    }

    private static String previewPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) return null;
        String path = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && path.startsWith(context)) path = path.substring(context.length());
        if (path.startsWith("/system/file/preview-")) return "/system/file/preview-*";
        return path.matches("/inner/(oa|hr|workflow)/file-preview(?:/.*)?") ? "/inner/{module}/file-preview/**" : null;
    }

    private static String downloadPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) return null;
        String path = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && path.startsWith(context)) path = path.substring(context.length());
        if (path.matches("/(?:auth/)?system/file/download")) return "/system/file/download";
        if (path.matches("/(?:auth/)?system/file/url")) return "/system/file/url";
        return path.matches("/(?:auth/)?system/file/[^/]+/url") ? "/system/file/{fileId}/url" : null;
    }

    private static String portalPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) return null;
        String path = request.getRequestURI();
        String context = request.getContextPath();
        if (context != null && !context.isEmpty() && path.startsWith(context)) path = path.substring(context.length());
        return path.equals("/portal") || path.startsWith("/portal/") ? "/portal/**" : null;
    }

    private static String oauthPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) return null;
        String path = request.getRequestURI();
        return path.matches("/(?:auth/)?oauth2(?:/.*)?") || path.startsWith("/system/oauth2/")
                || path.matches("/inner/(auth|crm|workflow)/oauth2(?:/.*)?") ? "/oauth2/**" : null;
    }

    private static String imPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) return null;
        String path = request.getRequestURI();
        if (path.matches("/(?:auth/)?system/im/binding(?:/.*)?")) return "/system/im/binding/**";
        return path.matches("/(?:auth/)?im(?:/.*)?") ? "/im/**" : null;
    }

    private static String workflowPath(HttpServletRequest request) {
        if (request == null || request.getRequestURI() == null) {
            return null;
        }
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String path = pattern == null ? request.getRequestURI() : pattern.toString();
        String contextPath = request.getContextPath();
        if (pattern == null && contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        if ("POST".equals(request.getMethod()) && ("/wf/start".equals(path) || "/wf/draft".equals(path)
                || "/wf/complete".equals(path) || "/wf/form/save".equals(path))) {
            return path;
        }
        if ("GET".equals(request.getMethod())) {
            if ("/wf/draft/list".equals(path)) {
                return path;
            }
            if (hasSingleSegment(path, "/wf/draft/context/")) {
                return "/wf/draft/context/{definitionId}";
            }
            if (hasSingleSegment(path, "/wf/draft/by-definition/")) {
                return "/wf/draft/by-definition/{definitionId}";
            }
        }
        if (("GET".equals(request.getMethod()) || "DELETE".equals(request.getMethod())) && hasSingleSegment(path, "/wf/draft/")) {
            return "/wf/draft/{draftId}";
        }
        return null;
    }

    private static boolean hasSingleSegment(String path, String prefix) {
        return path.startsWith(prefix) && path.length() > prefix.length() && path.indexOf('/', prefix.length()) < 0;
    }

    public static String safeCode(Object code) {
        String value = code instanceof Number || code instanceof String ? code.toString() : "UNKNOWN";
        return value.matches("[A-Z0-9_]{1,80}") ? value : "UNKNOWN";
    }

    public static String validationMessage(BindingResult result) {
        Object target = result.getTarget();
        String fields = result.getFieldErrors().stream()
                .map(error -> safeField(error.getField(), target == null ? null : target.getClass()))
                .filter(Objects::nonNull)
                .distinct()
                .limit(20)
                .collect(Collectors.joining("、"));
        return fields.isEmpty() ? "请求参数校验失败" : "请求参数校验失败: " + fields;
    }

    public static String safeField(String field, Class<?> beanType) {
        if (field == null || beanType == null) {
            return null;
        }
        String root = field.split("[.\\[]", 2)[0];
        return root.matches("[A-Za-z_][A-Za-z0-9_]{0,79}") && ReflectionUtils.findField(beanType, root) != null
                ? root : null;
    }
}

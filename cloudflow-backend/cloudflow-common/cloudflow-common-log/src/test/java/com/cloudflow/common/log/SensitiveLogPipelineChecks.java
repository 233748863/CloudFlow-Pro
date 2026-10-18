package com.cloudflow.common.log;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import cn.hutool.extra.spring.SpringUtil;
import com.cloudflow.common.core.aspect.RequestLogAspect;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.log.aspect.SysLogAspect;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.event.ApiErrorLogListener;
import com.cloudflow.common.log.event.SysLogListener;
import com.cloudflow.common.log.mapper.SysApiErrorLogMapper;
import com.cloudflow.common.log.mapper.SysLogMapper;
import com.cloudflow.common.log.util.SysLogUtils;
import com.cloudflow.common.log.web.ApiAccessLogInterceptor;
import com.cloudflow.common.log.web.ApiErrorLogResolver;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolationException;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.MethodParameter;
import org.springframework.core.env.MapPropertySource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.method.ControllerAdviceBean;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver;

import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class SensitiveLogPipelineChecks {
    private static final String PRIVATE_VALUE = "876543.21999 CIPHERTEXT_H FORM_H_PRIVATE REJECTED_H_PRIVATE";
    private static final String TRACE = "0123456789abcdef0123456789abcdef";
    private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
    private static final List<JsonNode> OPERATIONS = new CopyOnWriteArrayList<>();
    private static final List<JsonNode> ERRORS = new CopyOnWriteArrayList<>();
    private static final List<String> THREADS = new CopyOnWriteArrayList<>();
    private static final AtomicBoolean FAIL_INSERT = new AtomicBoolean();
    private static final AtomicInteger REQUEST_READS = new AtomicInteger();
    private static final AtomicInteger ARGUMENT_READS = new AtomicInteger();
    private static final ListAppender<ILoggingEvent> EVENTS = new ListAppender<>();
    private static final List<Logger> LOGGERS = new ArrayList<>();
    private static final Endpoints ENDPOINTS = new Endpoints();
    private static int checks;

    public static void main(String[] arguments) throws Throwable {
        EVENTS.start();
        for (Class<?> type : List.of(RequestLogAspect.class, SysLogAspect.class, ApiAccessLogInterceptor.class, ApiErrorLogResolver.class,
                SysLogListener.class, ApiErrorLogListener.class)) {
            capture(type.getName());
        }
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("checks", Map.of("spring.application.name", "workflow")));
            context.register(AsyncConfiguration.class);
            context.refresh();
            new SpringUtil().setApplicationContext(context);
            routeChecks();
            approvalRequestChecks(context);
            operationChecks(context);
            errorChecks(context);
            ordinaryChecks(context);
            loginAuditChecks(context);
            securityChecks();
            System.out.println("SensitiveLogPipelineChecks: " + checks + " checks passed");
        } finally {
            RequestContextHolder.resetRequestAttributes();
            UserContext.clear();
            TenantContext.clear();
            MDC.clear();
            LOGGERS.forEach(logger -> {
                logger.detachAppender(EVENTS);
                logger.setAdditive(true);
            });
            EVENTS.stop();
        }
    }

    private static void routeChecks() throws Exception {
        for (String route : List.of("POST /wf/start", "POST /wf/complete", "POST /wf/form/save", "POST /wf/draft", "GET /wf/draft/list", "GET /wf/draft/context/definition",
                "GET /wf/draft/by-definition/definition", "GET /wf/draft/FORM_H_PRIVATE", "DELETE /wf/draft/FORM_H_PRIVATE")) {
            String[] parts = route.split(" ", 2);
            RequestCase test = request(parts[0], parts[1], "ordinary", true, false);
            check(SensitiveLogPolicy.isSensitive(test.request()), "H route protected before controller execution");
            check(SysLogUtils.requestParams(test.request()) == null, "H query and form parameters never read");
            safeText(SensitiveLogPolicy.requestPath(test.request()));
            check(test.request().getAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE) == null, "H request parameter attribute removed");
        }
        for (String route : List.of("GET /wf/start", "GET /wf/complete", "GET /wf/form/save", "POST /wf/form/save-extra", "POST /wf/complete-extra", "POST /wf/start-extra", "POST /wf/drafts", "GET /wf/draft/cleanup/run", "GET /wf/tasks")) {
            String[] parts = route.split(" ", 2);
            RequestCase test = request(parts[0], parts[1], "ordinary", false, true);
            check(!SensitiveLogPolicy.isSensitive(test.request()), "unrelated routes retain ordinary policy");
        }
        RequestCase marked = request("POST", "/other/protected", "protectedCall", true, true);
        check(SensitiveLogPolicy.isSensitive(marked.request()), "explicit false annotation protects other modules");
        marked.request().removeAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE);
        marked.request().setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/error");
        check(SensitiveLogPolicy.isSensitive(marked.request()), "protected classification survives error dispatch");
        check(SysLogUtils.requestParams(marked.request()) == null, "error dispatch cannot recover protected form parameters");
        check(REQUEST_READS.get() == 0, "protected policy does not access request contents");
    }

    private static void approvalRequestChecks(AnnotationConfigApplicationContext context) throws Exception {
        for (String route : List.of("/wf/complete", "/wf/form/save")) {
            for (boolean resolved : List.of(false, true)) {
                clear(context);
                RequestCase test = request("POST", route, "ordinary", true, resolved);
                new RequestLogAspect(MAPPER).doBefore(point(test.handler().getMethod(), null, null, true));
                check(ARGUMENT_READS.get() == 0 && REQUEST_READS.get() == 0, "protected logger never reads defaults, form values or comments");
                check(EVENTS.list.size() == 1, "protected request retains one metadata-only diagnostic");
                for (ILoggingEvent event : EVENTS.list) {
                    safeText(event.getFormattedMessage());
                    check(event.getFormattedMessage().contains(route), "protected route retained for diagnosis");
                    check(event.getThrowableProxy() == null, "protected request excludes exception contents");
                }
                ApiAccessLogInterceptor access = new ApiAccessLogInterceptor(context, context.getBean(CloudFlowLogProperties.class));
                access.preHandle(test.request(), response(), test.handler());
                Exception failure = new IllegalArgumentException(PRIVATE_VALUE);
                new ApiErrorLogResolver(context).resolveException(test.request(), response(), test.handler(), failure);
                access.afterCompletion(test.request(), response(), test.handler(), failure);
                RequestContextHolder.resetRequestAttributes();
                drain(context);
                check(OPERATIONS.size() == 1 && ERRORS.size() == 1, "protected failure keeps asynchronous access and error records");
                safeRows();
            }
        }
    }

    private static void operationChecks(AnnotationConfigApplicationContext context) throws Throwable {
        SysLogAspect aspect = new SysLogAspect(context, MAPPER, context.getBean(CloudFlowLogProperties.class));
        for (String methodName : List.of("protectedCall", "ordinary")) {
            clear(context);
            RequestCase test = request("POST", methodName.equals("ordinary") ? "/wf/start" : "/other/protected", methodName, true, true);
            Method method = test.handler().getMethod();
            R<?> result = R.ok(Map.of("salary", PRIVATE_VALUE));
            check(aspect.around(point(method, result, null, true), method.getAnnotation(SysLog.class)) == result,
                    "business return object is unchanged");
            RequestContextHolder.resetRequestAttributes();
            drain(context);
            check(OPERATIONS.size() == 1, "one asynchronous operation row inserted");
            check("静态操作".equals(OPERATIONS.get(0).path("title").asText()), "sensitive title expressions are not evaluated");
            check(ARGUMENT_READS.get() == 0 && REQUEST_READS.get() == 0, "protected operation never reads arguments, headers or form parameters");
            safeRows();
        }
        List<Exception> failures = List.of(
                new SQLException("INSERT INTO payroll VALUES ('%s')".formatted(PRIVATE_VALUE)),
                new DuplicateKeyException(PRIVATE_VALUE, new SQLException(PRIVATE_VALUE)),
                new IllegalStateException(PRIVATE_VALUE, new IllegalArgumentException(PRIVATE_VALUE)),
                new ServiceException("业务条件不满足", 409, new SQLException(PRIVATE_VALUE)),
                new UnreadableException());
        for (Exception failure : failures) {
            clear(context);
            RequestCase test = request("POST", "/wf/start", "protectedCall", true, true);
            Method method = test.handler().getMethod();
            try {
                aspect.around(point(method, null, failure, true), method.getAnnotation(SysLog.class));
                throw new AssertionError("operation failure must propagate");
            } catch (Throwable propagated) {
                check(propagated == failure, "original business exception preserved for response handling");
            }
            new ApiErrorLogResolver(context).resolveException(test.request(), response(), test.handler(), failure);
            RequestContextHolder.resetRequestAttributes();
            drain(context);
            check(OPERATIONS.size() == 1 && ERRORS.size() == 1, "operation and error events persist asynchronously");
            check(failure.getClass().getName().equals(OPERATIONS.get(0).path("exception").asText()), "operation error retains only exception type");
            check(failure.getClass().getName().equals(ERRORS.get(0).path("exceptionClass").asText()), "error row retains only exception type");
            check(OPERATIONS.get(0).path("resultCode").asInt() == (failure instanceof ServiceException ? 409 : 500), "operation code preserved");
            safeRows();
        }
    }

    private static void errorChecks(AnnotationConfigApplicationContext context) throws Exception {
        Method method = Endpoints.class.getMethod("protectedCall", Object.class);
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(new Object(), "input");
        binding.addError(new FieldError("input", "salary", PRIVATE_VALUE, true, new String[]{"typeMismatch"}, null, PRIVATE_VALUE));
        List<Exception> failures = List.of(
                new BindException(binding), new MethodArgumentNotValidException(new MethodParameter(method, 0), binding),
                new ConstraintViolationException(PRIVATE_VALUE, Set.of()),
                new MethodArgumentTypeMismatchException(PRIVATE_VALUE, Long.class, "salary", new MethodParameter(method, 0), new IllegalArgumentException(PRIVATE_VALUE)),
                new SQLException(PRIVATE_VALUE), new IllegalArgumentException(PRIVATE_VALUE), new UnreadableException());
        for (Exception failure : failures) {
            clear(context);
            RequestCase test = request("POST", "/other/protected", "protectedCall", true, false);
            ApiAccessLogInterceptor access = new ApiAccessLogInterceptor(context, context.getBean(CloudFlowLogProperties.class));
            access.preHandle(test.request(), response(), test.handler());
            ApiErrorLogResolver resolver = new ApiErrorLogResolver(context);
            resolver.resolveException(test.request(), response(), test.handler(), failure);
            resolver.resolveException(test.request(), response(), test.handler(), failure);
            access.afterCompletion(test.request(), response(), test.handler(), failure);
            RequestContextHolder.resetRequestAttributes();
            drain(context);
            check(ERRORS.size() == 1 && OPERATIONS.size() == 1, "binding error captured once with safe completion log");
            check(REQUEST_READS.get() == 0, "resolved handler metadata protects before the controller aspect");
            safeRows();
        }
        clear(context);
        RequestCase malformed = request("POST", "/wf/draft", "ordinary", true, false);
        new ApiErrorLogResolver(context).resolveException(malformed.request(), response(), null,
                new HttpMessageNotReadableException(PRIVATE_VALUE, new IllegalArgumentException(PRIVATE_VALUE), new ServletServerHttpRequest(malformed.request())));
        drain(context);
        check(ERRORS.size() == 1, "malformed H JSON protected without handler metadata");
        safeRows();
        clear(context);
        FAIL_INSERT.set(true);
        RequestCase failing = request("POST", "/wf/draft", "protectedCall", true, true);
        ApiAccessLogInterceptor access = new ApiAccessLogInterceptor(context, context.getBean(CloudFlowLogProperties.class));
        access.preHandle(failing.request(), response(), failing.handler());
        new ApiErrorLogResolver(context).resolveException(failing.request(), response(), failing.handler(), new SQLException(PRIVATE_VALUE));
        access.afterCompletion(failing.request(), response(), failing.handler(), new IllegalStateException(PRIVATE_VALUE));
        RequestContextHolder.resetRequestAttributes();
        drain(context);
        check(EVENTS.list.size() == 2, "both asynchronous insert failures retain safe diagnostics");
        for (ILoggingEvent event : EVENTS.list) {
            safeText(event.getFormattedMessage());
            check(event.getThrowableProxy() == null, "asynchronous SQL failures do not attach causes or stacks");
            check(event.getFormattedMessage().contains(TRACE), "asynchronous failures keep trace identifiers");
        }
        FAIL_INSERT.set(false);
    }

    private static void ordinaryChecks(AnnotationConfigApplicationContext context) throws Throwable {
        clear(context);
        UserContext.setUserName("ordinary-operator");
        RequestCase test = request("POST", "/ordinary", "ordinary", false, true);
        test.request().removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
        check(SysLogUtils.requestParams(test.request()).contains("ordinary-visible"), "ordinary query parameter fallback preserved");
        test.request().setAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE, "captured-visible");
        check("captured-visible".equals(SysLogUtils.requestParams(test.request())), "ordinary captured parameter precedence preserved");
        Method method = test.handler().getMethod();
        SysLogAspect aspect = new SysLogAspect(context, MAPPER, context.getBean(CloudFlowLogProperties.class));
        aspect.around(point(method, R.ok(), null, false), method.getAnnotation(SysLog.class));
        drain(context);
        check(OPERATIONS.get(0).path("params").asText().contains("ordinary-visible"), "ordinary operation payload unchanged");
        check("ordinary-visible".equals(OPERATIONS.get(0).path("title").asText()), "ordinary expression title unchanged");
        check(ARGUMENT_READS.get() > 0, "ordinary argument logging still executes");
        new ApiErrorLogResolver(context).resolveException(test.request(), response(), test.handler(), new IllegalStateException("ordinary-error-visible"));
        drain(context);
        check(ERRORS.get(0).path("exceptionMessage").asText().equals("ordinary-error-visible"), "ordinary error message unchanged");
        check(ERRORS.get(0).path("exceptionStack").asText().contains("ordinary-error-visible"), "ordinary error stack unchanged");
        clear(context);
    }

    private static void loginAuditChecks(AnnotationConfigApplicationContext context) throws Exception {
        Class<?> loginType = Class.forName("cn.dev33.satoken.exception.NotLoginException");
        String token = "p_" + "S".repeat(43);
        Exception failure = (Exception) loginType.getConstructor(String.class, String.class, String.class)
                .newInstance("无效凭据：" + token + " " + PRIVATE_VALUE, "login", "-2");
        for (String route : List.of("/system/search/business", "/inner/crm/search", "/inner/oa/search",
                "/inner/hr/search", "/inner/workflow/search", "/ordinary/{id}")) {
            RequestCase test = request("GET", route + "/" + token, "ordinary", false, true);
            test.request().setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, route);
            check(!SensitiveLogPolicy.isSensitive(test.request()), "login audit protection works outside protected routes");
            new ApiErrorLogResolver(context).resolveException(test.request(), response(), test.handler(), failure);
            drain(context);
            check(ERRORS.size() == 1, "login failure retains one asynchronous error audit");
            JsonNode row = ERRORS.get(0);
            check(!row.toString().contains(token), "login error audit never persists supplied credentials");
            check(row.path("requestUrl").asText().equals(route), "login error audit retains only the route pattern");
            check(row.path("exceptionClass").asText().equals(loginType.getName()), "login error audit retains the exception type");
            safeRows();
            clear(context);
        }
    }

    private static void securityChecks() throws Exception {
        Class<?> adviceType = Class.forName("com.cloudflow.common.security.handler.SaTokenExceptionHandler");
        capture(adviceType.getName());
        capture(GlobalExceptionHandler.class.getName());
        Object advice = adviceType.getConstructor().newInstance();
        for (String name : List.of("NotLoginException", "NotPermissionException", "NotRoleException")) {
            EVENTS.list.clear();
            Class<?> exceptionType = Class.forName("cn.dev33.satoken.exception." + name);
            Exception failure = (Exception) (name.equals("NotLoginException")
                    ? exceptionType.getConstructor(String.class, String.class, String.class).newInstance(PRIVATE_VALUE, "login", "-1")
                    : exceptionType.getConstructor(String.class).newInstance(PRIVATE_VALUE));
            RequestCase test = request("POST", "/wf/start", "protectedCall", true, true);
            R<?> result = (R<?>) adviceType.getMethod("handle" + name, exceptionType, HttpServletRequest.class).invoke(advice, failure, test.request());
            check(result.getCode() == (name.equals("NotLoginException") ? 401 : 403), "H authorization status preserved");
            safeText(result.getMsg());
            for (ILoggingEvent event : EVENTS.list) {
                safeText(event.getFormattedMessage());
                check(event.getThrowableProxy() == null, "authorization handler does not attach exception");
            }
            try (GenericApplicationContext context = new GenericApplicationContext()) {
                context.getBeanFactory().registerSingleton("securityAdvice", advice);
                context.getBeanFactory().registerSingleton("coreAdvice", new GlobalExceptionHandler());
                context.refresh();
                ExceptionHandlerExceptionResolver resolver = new ExceptionHandlerExceptionResolver();
                resolver.setApplicationContext(context);
                resolver.afterPropertiesSet();
                Map.Entry<ControllerAdviceBean, ExceptionHandlerMethodResolver> first = resolver.getExceptionHandlerAdviceCache().entrySet().iterator().next();
                check(first.getKey().getBeanType() == adviceType && first.getValue().resolveMethod(failure) != null,
                        "actual security advice can handle H authorization before the common handler");
            }
        }
        RequestCase ordinary = request("POST", "/ordinary", "ordinary", false, true);
        Class<?> permission = Class.forName("cn.dev33.satoken.exception.NotPermissionException");
        Object failure = permission.getConstructor(String.class).newInstance("ordinary:visible");
        R<?> result = (R<?>) adviceType.getMethod("handleNotPermissionException", permission, HttpServletRequest.class)
                .invoke(advice, failure, ordinary.request());
        check(result.getMsg().contains("ordinary:visible"), "ordinary permission message unchanged");
        loginFailureChecks(adviceType, advice);
    }

    private static void loginFailureChecks(Class<?> adviceType, Object advice) throws Exception {
        Class<?> loginType = Class.forName("cn.dev33.satoken.exception.NotLoginException");
        GlobalExceptionHandler fallback = new GlobalExceptionHandler();
        for (String token : List.of("p_" + "S".repeat(43), "internalCredential876543")) {
            RuntimeException failure = (RuntimeException) loginType.getConstructor(String.class, String.class, String.class)
                    .newInstance("无效凭据：" + token + " " + PRIVATE_VALUE, "login", "-2");
            check(failure.getMessage().contains(token), "login failure fixture contains the supplied credential");
            for (String route : List.of("/system/search/business", "/inner/crm/search", "/inner/oa/search",
                    "/inner/hr/search", "/inner/workflow/search", "/ordinary/{id}")) {
                for (boolean resolvedRoute : List.of(true, false)) {
                    RequestCase test = request("GET", route + "/" + token, "ordinary", false, resolvedRoute);
                    if (resolvedRoute) test.request().setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, route);
                    check(!SensitiveLogPolicy.isSensitive(test.request()), "ordinary login failure does not rely on a protected route");
                    for (boolean securityAdvice : List.of(true, false)) {
                        EVENTS.list.clear();
                        R<?> response;
                        if (securityAdvice) {
                            response = (R<?>) adviceType.getMethod("handleNotLoginException", loginType, HttpServletRequest.class)
                                    .invoke(advice, failure, test.request());
                        } else {
                            org.springframework.http.ResponseEntity<R<?>> result = fallback.handleRuntimeException(failure, test.request());
                            check(result.getStatusCode().value() == 401, "fallback login failure retains HTTP 401");
                            response = result.getBody();
                        }
                        check(response != null && response.getCode() == 401, "login failure retains its authentication response");
                        check(!response.getMsg().contains(token), "login failure response excludes credentials");
                        safeText(response.getMsg());
                        check(EVENTS.list.size() == 1, "login failure retains one diagnostic event");
                        for (ILoggingEvent event : EVENTS.list) {
                            String message = event.getFormattedMessage();
                            check(!message.contains(token), "ordinary login failure never logs supplied credentials");
                            safeText(message);
                            check(message.contains("401") && message.contains("NotLoginException"), "login failure retains safe status and exception type");
                            check(message.contains(resolvedRoute ? route : "<unresolved>"), "login failure records a route pattern or unresolved marker");
                            check(event.getThrowableProxy() == null, "ordinary login failure never attaches credential-bearing exceptions");
                        }
                    }
                }
            }
        }
    }

    private static void safeRows() {
        check(!THREADS.isEmpty() && THREADS.stream().allMatch(name -> name.startsWith("h-sensitive-log-")), "real Spring async listeners ran on their worker");
        for (JsonNode row : OPERATIONS) {
            safeText(row.toString());
            check(row.path("params").isNull() && row.path("userAgent").isNull() && row.path("createBy").isNull(), "operation row excludes payload and free-text metadata");
            check(TRACE.equals(row.path("traceId").asText()), "operation trace retained after request context ends");
        }
        for (JsonNode row : ERRORS) {
            safeText(row.toString());
            check(row.path("requestParams").isNull() && row.path("exceptionMessage").isNull() && row.path("exceptionStack").isNull(),
                    "error row has no body, message, cause or stack");
            check(row.path("userName").isNull() && row.path("userAgent").isNull(), "error metadata excludes arbitrary text");
            check(TRACE.equals(row.path("traceId").asText()), "error trace retained after request context ends");
        }
    }

    private static void safeText(String text) {
        for (String marker : List.of("876543", "CIPHERTEXT_H", "FORM_H_PRIVATE", "REJECTED_H_PRIVATE")) {
            check(!text.contains(marker), "private marker absent from asynchronous rows, logs and responses");
        }
    }

    private static void clear(AnnotationConfigApplicationContext context) throws Exception {
        drain(context);
        OPERATIONS.clear();
        ERRORS.clear();
        THREADS.clear();
        EVENTS.list.clear();
        REQUEST_READS.set(0);
        ARGUMENT_READS.set(0);
        UserContext.setUserId(101L);
        UserContext.setTenantId(100000L);
        UserContext.setUserName(PRIVATE_VALUE);
    }

    private static void drain(AnnotationConfigApplicationContext context) throws Exception {
        context.getBean(ThreadPoolTaskExecutor.class).submit(() -> {}).get(10, TimeUnit.SECONDS);
    }

    private static RequestCase request(String httpMethod, String path, String methodName, boolean protectedRequest, boolean handlerAttribute) throws Exception {
        MDC.put("traceId", TRACE);
        HandlerMethod handler = new HandlerMethod(ENDPOINTS, Endpoints.class.getMethod(methodName, Object.class));
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE, protectedRequest ? PRIVATE_VALUE : "ordinary-visible");
        if (handlerAttribute) attributes.put(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE, handler);
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (instance, method, values) -> switch (method.getName()) {
                    case "getAttribute" -> attributes.get(values[0]);
                    case "setAttribute" -> attributes.put((String) values[0], values[1]);
                    case "removeAttribute" -> attributes.remove(values[0]);
                    case "getRequestURI" -> path;
                    case "getContextPath" -> "";
                    case "getMethod" -> httpMethod;
                    case "getRemoteAddr" -> "127.0.0.1";
                    case "getParameterMap", "getHeader", "getInputStream", "getReader" -> {
                        if (protectedRequest) {
                            REQUEST_READS.incrementAndGet();
                            throw new AssertionError("protected request contents must not be read");
                        }
                        yield method.getName().equals("getParameterMap") ? Map.of("note", new String[]{"ordinary-visible"}) : null;
                    }
                    default -> null;
                });
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return new RequestCase(request, handler);
    }

    private static HttpServletResponse response() {
        return (HttpServletResponse) Proxy.newProxyInstance(HttpServletResponse.class.getClassLoader(), new Class<?>[]{HttpServletResponse.class},
                (instance, method, values) -> method.getName().equals("getStatus") ? 500 : null);
    }

    private static ProceedingJoinPoint point(Method method, Object result, Throwable failure, boolean protectedRequest) {
        MethodSignature signature = (MethodSignature) Proxy.newProxyInstance(MethodSignature.class.getClassLoader(), new Class<?>[]{MethodSignature.class},
                (instance, invoked, values) -> switch (invoked.getName()) {
                    case "getMethod" -> method;
                    case "getDeclaringType" -> Endpoints.class;
                    case "getParameterNames" -> new String[]{"payload"};
                    default -> null;
                });
        return (ProceedingJoinPoint) Proxy.newProxyInstance(ProceedingJoinPoint.class.getClassLoader(), new Class<?>[]{ProceedingJoinPoint.class},
                (instance, invoked, values) -> switch (invoked.getName()) {
                    case "getSignature" -> signature;
                    case "getTarget" -> ENDPOINTS;
                    case "getArgs" -> {
                        ARGUMENT_READS.incrementAndGet();
                        if (protectedRequest) throw new AssertionError("sensitive arguments must never be read for titles or payloads");
                        yield new Object[]{"ordinary-visible"};
                    }
                    case "proceed" -> {
                        if (failure != null) throw failure;
                        yield result;
                    }
                    default -> null;
                });
    }

    private static <MapperType> MapperType mapper(Class<MapperType> type, List<JsonNode> rows) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, values) -> {
            if (method.getName().equals("insert")) {
                THREADS.add(Thread.currentThread().getName());
                check(RequestContextHolder.getRequestAttributes() == null, "async persistence cannot access request bodies");
                if (FAIL_INSERT.get()) throw new DataAccessResourceFailureException("INSERT %s".formatted(PRIVATE_VALUE), new SQLException(PRIVATE_VALUE));
                rows.add(MAPPER.valueToTree(values[0]));
                return 1;
            }
            return null;
        }));
    }

    private static void capture(String name) {
        Logger logger = (Logger) LoggerFactory.getLogger(name);
        logger.setAdditive(false);
        logger.addAppender(EVENTS);
        LOGGERS.add(logger);
    }

    private static synchronized void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private record RequestCase(HttpServletRequest request, HandlerMethod handler) {}

    public static class Endpoints {
        @SysLog(value = "静态操作", expression = "#payload", logParams = false)
        public void protectedCall(Object payload) {}

        @SysLog(value = "静态操作", expression = "#payload")
        public void ordinary(Object payload) {}
    }

    private static class UnreadableException extends RuntimeException {
        @Override
        public String getMessage() {
            throw new AssertionError("raw exception message must never be read");
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableAsync
    static class AsyncConfiguration {
        @Bean
        ThreadPoolTaskExecutor taskExecutor() {
            ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
            executor.setCorePoolSize(1);
            executor.setMaxPoolSize(1);
            executor.setThreadNamePrefix("h-sensitive-log-");
            executor.setWaitForTasksToCompleteOnShutdown(true);
            return executor;
        }

        @Bean
        ObjectMapper objectMapper() { return MAPPER; }

        @Bean
        CloudFlowLogProperties logProperties() {
            CloudFlowLogProperties properties = new CloudFlowLogProperties();
            properties.setRequestEnabled(true);
            return properties;
        }

        @Bean
        SysLogListener sysLogListener(CloudFlowLogProperties properties) {
            return new SysLogListener(mapper(SysLogMapper.class, OPERATIONS), properties, MAPPER);
        }

        @Bean
        ApiErrorLogListener apiErrorLogListener() {
            return new ApiErrorLogListener(mapper(SysApiErrorLogMapper.class, ERRORS));
        }
    }
}

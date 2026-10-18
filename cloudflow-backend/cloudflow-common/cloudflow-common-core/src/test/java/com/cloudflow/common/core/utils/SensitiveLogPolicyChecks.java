package com.cloudflow.common.core.utils;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.cloudflow.common.core.aspect.RequestLogAspect;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.lang.reflect.Field;
import javax.tools.JavaCompiler;
import javax.tools.StandardJavaFileManager;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.MethodParameter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpHeaders;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.validation.beanvalidation.SpringValidatorAdapter;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.method.ControllerAdviceBean;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver;

import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.ToolProvider;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public class SensitiveLogPolicyChecks {
    private static final String PRIVATE_VALUE = "876543.21999 CIPHERTEXT_H FORM_H_PRIVATE REJECTED_H_PRIVATE";
    private static final String TRACE = "0123456789abcdef0123456789abcdef";
    private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
    private static final ListAppender<ILoggingEvent> EVENTS = new ListAppender<>();
    private static final List<Logger> LOGGERS = new ArrayList<>();
    private static int checks;
    private static Object fixture;
    private static Method sensitiveMethod;

    public static void main(String[] arguments) throws Throwable {
        compileFixture(Path.of(arguments[0]));
        fixture = Class.forName("com.cloudflow.common.core.utils.SensitiveLogFixture").getConstructor().newInstance();
        sensitiveMethod = fixture.getClass().getMethod("sensitive", PayrollInput.class);
        EVENTS.start();
        capture(RequestLogAspect.class.getName());
        capture(GlobalExceptionHandler.class.getName());
        try {
            metadataChecks();
            requestChecks();
            exceptionChecks();
            if (arguments.length > 1 && "--workflow".equals(arguments[1])) {
                workflowChecks();
            }
            System.out.println("SensitiveLogPolicyChecks: " + checks + " checks passed");
        } finally {
            RequestContextHolder.resetRequestAttributes();
            MDC.clear();
            LOGGERS.forEach(logger -> {
                logger.detachAppender(EVENTS);
                logger.setAdditive(true);
            });
            EVENTS.stop();
        }
    }

    private static void metadataChecks() throws Exception {
        check(SensitiveLogPolicy.isSensitive(sensitiveMethod, fixture.getClass()), "existing false annotation detected");
        for (String methodName : List.of("ordinary", "defaults", "enabled")) {
            Method method = fixture.getClass().getMethod(methodName, PayrollInput.class);
            check(!SensitiveLogPolicy.isSensitive(method, fixture.getClass()), "ordinary annotation semantics preserved");
        }
        Class<?> contract = Class.forName(fixture.getClass().getName() + "$Contract");
        Class<?> implementation = Class.forName(fixture.getClass().getName() + "$Implementation");
        Method interfaceMethod = contract.getMethod("inherited", Object.class);
        check(SensitiveLogPolicy.isSensitive(interfaceMethod, implementation), "interface and generic bridge metadata detected");
        check(SensitiveLogPolicy.isSensitive(implementation.getMethod("inherited", PayrollInput.class), implementation),
                "implementation inherits interface metadata");
        Object proxy = Proxy.newProxyInstance(contract.getClassLoader(), new Class<?>[]{contract}, (instance, method, values) -> null);
        check(SensitiveLogPolicy.isSensitive(proxy.getClass().getMethod("inherited", Object.class), proxy.getClass()),
                "JDK proxy retains interface metadata");
        check(!SensitiveLogPolicy.isSensitive((HttpServletRequest) null), "non-web requests are unchanged");
    }

    private static void requestChecks() throws Exception {
        RequestLogAspect aspect = new RequestLogAspect(MAPPER);
        HttpServletRequest request = request(sensitiveMethod);
        request.setAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE, PRIVATE_VALUE);
        AtomicInteger argumentReads = new AtomicInteger();
        aspect.doBefore(joinPoint(sensitiveMethod, argumentReads));
        check(argumentReads.get() == 0, "sensitive arguments are never read or serialized");
        check(request.getAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE) == null, "sensitive request attribute removed");
        safeLogs();
        request.removeAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE);
        aspect.doBefore(joinPoint(sensitiveMethod, argumentReads));
        check(argumentReads.get() == 0, "join point metadata protects requests without handler attributes");
        safeLogs();
        for (String methodName : List.of("ordinary", "defaults", "enabled")) {
            Method method = fixture.getClass().getMethod(methodName, PayrollInput.class);
            request = request(method);
            argumentReads.set(0);
            aspect.doBefore(joinPoint(method, argumentReads));
            check(argumentReads.get() == 1, "ordinary request arguments still read");
            check(request.getAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE).toString().contains("ordinary-visible"),
                    "ordinary request parameters still available");
            check(EVENTS.list.size() == 1, "ordinary request metadata and safe parameters share one log event");
            String message = EVENTS.list.get(0).getFormattedMessage();
            check(message.contains("请求 URL:") && message.contains("HTTP 方法:") && message.contains("类方法:")
                    && message.contains("来源 IP:") && message.contains("ordinary-visible"),
                    "single request event retains metadata and ordinary parameters");
            EVENTS.list.clear();
        }
    }

    private static void exceptionChecks() throws Throwable {
        HttpServletRequest request = request(sensitiveMethod);
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        Field registryField = GlobalExceptionHandler.class.getDeclaredField("meterRegistry");
        registryField.setAccessible(true);
        registryField.set(handler, registry);
        PayrollInput input = new PayrollInput();
        BeanPropertyBindingResult binding = new BeanPropertyBindingResult(input, "input");
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            Validator validator = factory.getValidator();
            check(validator.validate(input).size() == 3, "precision, length and required constraints exercised");
            new SpringValidatorAdapter(validator).validate(input, binding);
            binding.addError(new FieldError("input", "formData[" + PRIVATE_VALUE + "]", PRIVATE_VALUE, true,
                    new String[]{"typeMismatch"}, new Object[]{PRIVATE_VALUE}, PRIVATE_VALUE));
            binding.addError(new FieldError("input", PRIVATE_VALUE, PRIVATE_VALUE));
            verify(handler.handleBindException(new BindException(binding)), 400);
            verify(handler.handleMethodArgumentNotValidException(new MethodArgumentNotValidException(
                    new MethodParameter(sensitiveMethod, 0), binding)), 400);
            verify(handler.handleConstraintViolationException(new ConstraintViolationException(PRIVATE_VALUE, validator.validate(input))), 400);
        }
        BeanPropertyBindingResult objectErrors = new BeanPropertyBindingResult(input, "input");
        objectErrors.addError(new ObjectError("input", PRIVATE_VALUE));
        verify(handler.handleBindException(new BindException(objectErrors)), 400);
        verify(handler.handleMethodArgumentNotValidException(new MethodArgumentNotValidException(
                new MethodParameter(sensitiveMethod, 0), objectErrors)), 400);
        verify(handler.handleMethodArgumentTypeMismatchException(new MethodArgumentTypeMismatchException(
                PRIVATE_VALUE, BigDecimal.class, "salary", new MethodParameter(sensitiveMethod, 0),
                new IllegalArgumentException(PRIVATE_VALUE))), 400);
        verify(handler.handleMissingServletRequestParameterException(new MissingServletRequestParameterException(PRIVATE_VALUE, "String")), 400);
        try {
            MAPPER.readTree("{\"salary\":\"" + PRIVATE_VALUE + "\"");
            throw new AssertionError("invalid JSON must fail");
        } catch (JsonProcessingException exception) {
            verify(handler.handleHttpMessageNotReadableException(new HttpMessageNotReadableException(
                    PRIVATE_VALUE, exception, new ServletServerHttpRequest(request))), 400);
        }
        List<DefaultMessageSourceResolvable> errors = List.of(new DefaultMessageSourceResolvable(new String[]{"invalid"}, new Object[]{PRIVATE_VALUE}, PRIVATE_VALUE));
        for (int parameterIndex : List.of(0, -1)) {
            MethodValidationResult validation = MethodValidationResult.create(fixture, sensitiveMethod, List.of(new ParameterValidationResult(
                    new MethodParameter(sensitiveMethod, parameterIndex), input, errors, null, null, null)));
            verify(handler.handleHandlerMethodValidationException(new HandlerMethodValidationException(validation), request),
                    parameterIndex == 0 ? 400 : 500);
        }
        verify(handler.handleHttpRequestMethodNotSupportedException(new HttpRequestMethodNotSupportedException(PRIVATE_VALUE), request), 405);
        for (Exception missing : List.of(new NoResourceFoundException(HttpMethod.PUT, PRIVATE_VALUE),
                new NoHandlerFoundException("DELETE", PRIVATE_VALUE, HttpHeaders.EMPTY))) {
            verify(handler.handleResourceNotFoundException(missing, request), 404);
            check(new ExceptionHandlerMethodResolver(GlobalExceptionHandler.class).resolveMethod(missing).getName()
                    .equals("handleResourceNotFoundException"), "missing route selects 404 instead of generic 500");
        }
        verify(handler.handleConcurrentException(new DuplicateKeyException(PRIVATE_VALUE), request), 409);
        verify(handler.handleDatabaseException(new SQLException(PRIVATE_VALUE, new IllegalArgumentException(PRIVATE_VALUE)), request), 500);
        verify(handler.handleDatabaseException(new DataAccessResourceFailureException(PRIVATE_VALUE), request), 500);
        verify(handler.handleUnsupportedOperationException(new UnsupportedOperationException(PRIVATE_VALUE), request), 400);
        verify(handler.handleUnsupportedOperationException(new UnsupportedOperationException("ERR.AUDIT_IMMUTABLE " + PRIVATE_VALUE), request), 410);
        verify(handler.handleRuntimeException(new IllegalArgumentException(PRIVATE_VALUE, new IllegalStateException(PRIVATE_VALUE)), request), 500);
        verify(handler.handleRuntimeException(new UnreadableException(), request), 500);
        verify(handler.handleException(new Exception(PRIVATE_VALUE, new IllegalStateException(PRIVATE_VALUE)), request), 500);
        verify(handler.handleRateLimitThrowable(new AssertionError(PRIVATE_VALUE), request), 500);
        ServiceException service = new ServiceException("草稿已过期，请重新填写", 409, new IllegalArgumentException(PRIVATE_VALUE));
        ResponseEntity<R<?>> business = handler.handleServiceException(service, request);
        check(service.getMessage().equals(business.getBody().getMsg()), "safe service business message preserved");
        verify(business, 409);
        check(registry.counter("exception.count", "type", "ServiceException", "code", "409").count() == 1,
                "business error metrics preserved");
        business = handler.handleServiceException(new ServiceException("草稿已过期，请重新填写", 14009), request);
        check(business.getStatusCode().value() == 400 && business.getBody().getCode() == 14009, "custom business code preserved");
        safeLogs();
        check(request.getAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE) == null, "pre-controller errors never populate parameters");
        request = request(fixture.getClass().getMethod("ordinary", PayrollInput.class));
        BeanPropertyBindingResult ordinary = new BeanPropertyBindingResult(input, "input");
        ordinary.addError(new FieldError("input", "salary", "ordinary-visible"));
        check("ordinary-visible".equals(handler.handleBindException(new BindException(ordinary)).getMsg()),
                "ordinary binding message unchanged");
        EVENTS.list.clear();
        handler.handleRuntimeException(new IllegalArgumentException("ordinary-visible"), request);
        check(EVENTS.list.stream().anyMatch(event -> event.getFormattedMessage().contains("ordinary-visible")),
                "ordinary exception logging unchanged");
        EVENTS.list.clear();
        registry.close();
    }

    private static void workflowChecks() throws Throwable {
        Class<?> adviceType = Class.forName("com.cloudflow.workflow.exception.WorkflowExceptionHandler");
        capture(adviceType.getName());
        Object advice = adviceType.getConstructor().newInstance();
        HttpServletRequest request = request(sensitiveMethod);
        for (String type : List.of("WorkflowException", "ValidationException", "BusinessException", "NotFoundException",
                "PermissionDeniedException", "RateLimitException")) {
            Class<?> exceptionType = Class.forName("com.cloudflow.workflow.exception." + type);
            Object exception = exceptionType.getConstructor(String.class).newInstance(PRIVATE_VALUE);
            if ("ValidationException".equals(type)) {
                exceptionType.getMethod("addFieldError", String.class, String.class, Object.class)
                        .invoke(exception, "formData[" + PRIVATE_VALUE + "]", PRIVATE_VALUE, PRIVATE_VALUE);
            }
            if ("BusinessException".equals(type)) {
                exception = exceptionType.getConstructor(String.class, String.class, Map.class)
                        .newInstance("INVALID_REQUEST", PRIVATE_VALUE, Map.of("salary", PRIVATE_VALUE));
            }
            ResponseEntity<?> response = (ResponseEntity<?>) adviceType.getMethod("handle" + type, exceptionType, HttpServletRequest.class)
                    .invoke(advice, exception, request);
            int status = switch (type) {
                case "NotFoundException" -> 404;
                case "PermissionDeniedException" -> 403;
                case "RateLimitException" -> 429;
                default -> 400;
            };
            verify(response, status);
            check(response.getBody().getClass().getMethod("getErrors").invoke(response.getBody()) == null, "workflow rejected values removed");
            check(response.getBody().getClass().getMethod("getData").invoke(response.getBody()) == null, "workflow payload data removed");
            if (status == 429) {
                check("1".equals(response.getHeaders().getFirst("Retry-After")), "rate limit header preserved");
            }
        }
        Class<?> workflowException = Class.forName("com.cloudflow.workflow.exception.WorkflowException");
        Object expired = workflowException.getConstructor(String.class, String.class).newInstance("DRAFT_EXPIRED", PRIVATE_VALUE);
        ResponseEntity<?> response = (ResponseEntity<?>) adviceType.getMethod("handleWorkflowException", workflowException, HttpServletRequest.class)
                .invoke(advice, expired, request);
        check("DRAFT_EXPIRED".equals(response.getBody().getClass().getMethod("getCode").invoke(response.getBody())), "draft business code preserved");
        check(response.getBody().getClass().getMethod("getMessage").invoke(response.getBody()).toString().contains("已过期"), "safe draft explanation preserved");
        verify(response, 410);
        Map<String, Integer> draftStatuses = Map.ofEntries(
                Map.entry("DRAFT_NOT_FOUND", 404), Map.entry("DRAFT_CONFLICT", 409), Map.entry("DRAFT_EXPIRED", 410),
                Map.entry("DRAFT_STALE", 409), Map.entry("DRAFT_UNAVAILABLE", 403), Map.entry("DRAFT_TOO_LARGE", 413),
                Map.entry("DRAFT_INVALID_DATA", 400), Map.entry("FORM_INVALID_DATA", 400), Map.entry("FORM_INVALID_DEFINITION", 400),
                Map.entry("FORM_UNSUPPORTED_FIELD_TYPE", 400), Map.entry("FORM_UNSUPPORTED_VALIDATION", 400));
        for (Map.Entry<String, Integer> expected : draftStatuses.entrySet()) {
            Object failure = workflowException.getConstructor(String.class, String.class).newInstance(expected.getKey(), PRIVATE_VALUE);
            response = (ResponseEntity<?>) adviceType.getMethod("handleWorkflowException", workflowException, HttpServletRequest.class)
                    .invoke(advice, failure, request);
            check(expected.getKey().equals(response.getBody().getClass().getMethod("getCode").invoke(response.getBody())),
                    "draft error code retained for recovery and deletion");
            if ("DRAFT_INVALID_DATA".equals(expected.getKey())) {
                check("草稿数据不符合要求，请检查后重试".equals(response.getBody().getClass().getMethod("getMessage").invoke(response.getBody())),
                        "invalid draft uses a fixed safe explanation");
            }
            verify(response, expected.getValue());
        }
        check(adviceType.getAnnotation(Order.class).value() == Ordered.HIGHEST_PRECEDENCE, "workflow advice priority unchanged");
        check(GlobalExceptionHandler.class.getAnnotation(Order.class).value() == Ordered.LOWEST_PRECEDENCE, "core advice priority unchanged");
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            context.getBeanFactory().registerSingleton("coreAdvice", new GlobalExceptionHandler());
            context.getBeanFactory().registerSingleton("workflowAdvice", advice);
            context.refresh();
            ExceptionHandlerExceptionResolver resolver = new ExceptionHandlerExceptionResolver();
            resolver.setApplicationContext(context);
            resolver.afterPropertiesSet();
            Map.Entry<ControllerAdviceBean, ExceptionHandlerMethodResolver> first = resolver.getExceptionHandlerAdviceCache().entrySet().iterator().next();
            check(first.getKey().getBeanType() == adviceType, "Spring resolves workflow advice before core advice");
            check(first.getValue().resolveMethod((Exception) expired).getName().equals("handleWorkflowException"), "workflow exception uses protected handler");
        }
        runtimeDependencyChecks();
    }

    private static void runtimeDependencyChecks() throws Throwable {
        HttpServletRequest request = request(sensitiveMethod);
        GlobalExceptionHandler handler = new GlobalExceptionHandler();
        Class<?> rateType = Class.forName("com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect$RateLimitException");
        RuntimeException rateLimit = (RuntimeException) rateType.getConstructor(String.class).newInstance(PRIVATE_VALUE);
        verify(handler.handleRuntimeException(rateLimit, request), 429);
        verify(handler.handleException(rateLimit, request), 429);
        verify(handler.handleRateLimitThrowable(rateLimit, request), 429);
        Class<?> permissionType = Class.forName("cn.dev33.satoken.exception.NotPermissionException");
        RuntimeException permission = (RuntimeException) permissionType.getConstructor(String.class).newInstance(PRIVATE_VALUE);
        verify(handler.handleRuntimeException(permission, request), 403);
        Class<?> roleType = Class.forName("cn.dev33.satoken.exception.NotRoleException");
        RuntimeException role = (RuntimeException) roleType.getConstructor(String.class).newInstance(PRIVATE_VALUE);
        verify(handler.handleRuntimeException(role, request), 403);
        Class<?> loginType = Class.forName("cn.dev33.satoken.exception.NotLoginException");
        RuntimeException login = (RuntimeException) loginType.getConstructor(String.class, String.class, String.class)
                .newInstance(PRIVATE_VALUE, "login", "-1");
        verify(handler.handleRuntimeException(login, request), 401);
    }

    private static void verify(Object result, int status) throws JsonProcessingException {
        Object body = result;
        if (result instanceof ResponseEntity<?> response) {
            check(response.getStatusCode().value() == status, "HTTP status preserved");
            body = response.getBody();
        }
        if (body instanceof R<?> response) {
            check(response.getCode() == status, "common response code preserved");
        }
        safeText(MAPPER.writeValueAsString(body));
        safeLogs();
    }

    private static void safeLogs() {
        check(!EVENTS.list.isEmpty(), "failure retains diagnostic metadata");
        for (ILoggingEvent event : EVENTS.list) {
            safeText(event.getFormattedMessage());
            check(event.getThrowableProxy() == null, "no throwable or stack is logged");
            check(event.getFormattedMessage().contains(TRACE), "trace retained");
            check(event.getFormattedMessage().contains("/sensitive/{id}"), "route pattern retained instead of path value");
            for (Object argument : event.getArgumentArray()) {
                check(argument instanceof String, "log arguments contain only whitelisted strings");
            }
        }
        EVENTS.list.clear();
    }

    private static void safeText(String text) {
        for (String marker : List.of("876543", "CIPHERTEXT_H", "FORM_H_PRIVATE", "REJECTED_H_PRIVATE")) {
            check(!text.contains(marker), "private content absent");
        }
    }

    private static HttpServletRequest request(Method method) {
        EVENTS.list.clear();
        MDC.put("traceId", TRACE);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE, new HandlerMethod(fixture, method));
        attributes.put(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/sensitive/{id}");
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, (instance, invoked, values) -> switch (invoked.getName()) {
                    case "getAttribute" -> attributes.get(values[0]);
                    case "setAttribute" -> attributes.put((String) values[0], values[1]);
                    case "removeAttribute" -> attributes.remove(values[0]);
                    case "getRequestURI" -> "/sensitive/" + PRIVATE_VALUE;
                    case "getMethod" -> "POST";
                    case "getRemoteAddr" -> "127.0.0.1";
                    default -> null;
                });
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return request;
    }

    private static JoinPoint joinPoint(Method method, AtomicInteger argumentReads) {
        MethodSignature signature = (MethodSignature) Proxy.newProxyInstance(MethodSignature.class.getClassLoader(),
                new Class<?>[]{MethodSignature.class}, (instance, invoked, values) -> switch (invoked.getName()) {
                    case "getMethod" -> method;
                    case "getName" -> method.getName();
                    case "getDeclaringType" -> method.getDeclaringClass();
                    case "getDeclaringTypeName" -> method.getDeclaringClass().getName();
                    case "getParameterNames" -> new String[]{"payload"};
                    default -> null;
                });
        return (JoinPoint) Proxy.newProxyInstance(JoinPoint.class.getClassLoader(), new Class<?>[]{JoinPoint.class},
                (instance, invoked, values) -> switch (invoked.getName()) {
                    case "getSignature" -> signature;
                    case "getTarget" -> fixture;
                    case "getArgs" -> {
                        argumentReads.incrementAndGet();
                        yield new Object[]{Map.of("note", "ordinary-visible")};
                    }
                    default -> null;
                });
    }

    private static void capture(String name) {
        Logger logger = (Logger) LoggerFactory.getLogger(name);
        logger.setAdditive(false);
        logger.addAppender(EVENTS);
        LOGGERS.add(logger);
    }

    private static void check(boolean condition, String description) {
        if (!condition) {
            throw new AssertionError(description);
        }
        checks++;
    }

    private static void compileFixture(Path root) throws Exception {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        Path annotation = root.resolve("cloudflow-backend/cloudflow-common/cloudflow-common-log/src/main/java/com/cloudflow/common/log/annotation/SysLog.java");
        Path output = Path.of(SensitiveLogPolicyChecks.class.getProtectionDomain().getCodeSource().getLocation().toURI());
        String source = """
                package com.cloudflow.common.core.utils;
                import com.cloudflow.common.log.annotation.SysLog;
                public class SensitiveLogFixture {
                    @SysLog(logParams=false) public void sensitive(SensitiveLogPolicyChecks.PayrollInput payload) {}
                    @SysLog public void defaults(SensitiveLogPolicyChecks.PayrollInput payload) {}
                    @SysLog(logParams=true) public void enabled(SensitiveLogPolicyChecks.PayrollInput payload) {}
                    public void ordinary(SensitiveLogPolicyChecks.PayrollInput payload) {}
                    public interface Contract<Payload> {
                        @SysLog(logParams=false) void inherited(Payload payload);
                    }
                    public static class Implementation implements Contract<SensitiveLogPolicyChecks.PayrollInput> {
                        public void inherited(SensitiveLogPolicyChecks.PayrollInput payload) {}
                    }
                }
                """;
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(null, null, java.nio.charset.StandardCharsets.UTF_8)) {
            List<JavaFileObject> sources = new ArrayList<>();
            manager.getJavaFileObjects(annotation.toFile()).forEach(sources::add);
            sources.add(new SimpleJavaFileObject(URI.create("string:///com/cloudflow/common/core/utils/SensitiveLogFixture.java"), JavaFileObject.Kind.SOURCE) {
                @Override
                public CharSequence getCharContent(boolean ignoreEncodingErrors) {
                    return source;
                }
            });
            check(Boolean.TRUE.equals(compiler.getTask(null, manager, null,
                    List.of("-proc:none", "-parameters", "-classpath", System.getProperty("java.class.path"), "-d", output.toString()),
                    null, sources).call()), "fixtures compile against the existing annotation without a core dependency");
        }
    }

    public static class PayrollInput {
        @Digits(integer = 3, fraction = 2, message = PRIVATE_VALUE)
        private BigDecimal salary = new BigDecimal("876543.21999");
        @Size(max = 4, message = PRIVATE_VALUE)
        private String note = PRIVATE_VALUE.repeat(2000);
        @NotNull(message = PRIVATE_VALUE)
        private String required;
        private Map<String, Object> formData = Map.of("value", PRIVATE_VALUE);

        public BigDecimal getSalary() { return salary; }
        public String getNote() { return note; }
        public String getRequired() { return required; }
        public Map<String, Object> getFormData() { return formData; }
    }

    private static class UnreadableException extends RuntimeException {
        @Override
        public String getMessage() {
            throw new AssertionError("raw exception message must not be accessed");
        }
    }
}

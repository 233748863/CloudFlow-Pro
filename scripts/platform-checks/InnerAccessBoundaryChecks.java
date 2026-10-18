package com.cloudflow.common.security.aspect;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Proxy;
import java.util.Map;

public class InnerAccessBoundaryChecks {
    private static int checks;
    private static final GlobalExceptionHandler HANDLER = new GlobalExceptionHandler();

    public static void main(String[] arguments) throws Exception {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("inner-checks", Map.of(
                "cloudflow.security.inner.check.callers", "cloudflow-service-crm, cloudflow-service-hr")));
        ProtectedController target = new ProtectedController();
        AspectJProxyFactory factory = new AspectJProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAspect(new InnerAspect(environment));
        ProtectedController controller = factory.getProxy();
        try {
            RequestContextHolder.resetRequestAttributes();
            denied(controller::draft, "missing request context");
            bind(Map.of());
            denied(controller::draft, "missing internal header");
            bind(Map.of(SecurityConstants.INNER_CALL_HEADER, "TRUE",
                    SecurityConstants.FROM_SERVICE_HEADER, "cloudflow-service-crm"));
            denied(controller::draft, "nonmatching internal header");
            bind(Map.of(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE));
            denied(controller::draft, "missing caller");
            bind(internal("cloudflow-service-auth"));
            denied(controller::draft, "caller outside allowlist");
            check(target.calls == 0, "denied requests never execute controller");
            bind(internal("cloudflow-service-crm"));
            check("draft".equals(controller.draft()) && target.calls == 1, "authorized service executes controller");
            bind(internal("cloudflow-service-hr"));
            check("configured".equals(controller.configured()), "configured CSV allowlist accepts listed service");
            denied(controller::draft, "configuration does not widen fixed allowlist");
            bind(internal("cloudflow-service-oa"));
            denied(controller::configured, "configured CSV rejects unlisted service");
            RequestContextHolder.resetRequestAttributes();
            check("public".equals(controller.publicEndpoint()), "explicit opt-out preserves public endpoint");
            classBoundary(environment);
            missingParameterChecks();
            bind(internal("cloudflow-service-crm"));
            try {
                controller.failure();
                throw new AssertionError("unexpected controller success");
            } catch (IllegalStateException exception) {
                ResponseEntity<R<?>> response = HANDLER.handleRuntimeException(exception, request(Map.of()));
                check(response.getStatusCode().value() == 500, "unknown failure remains HTTP 500");
                check(!response.getBody().getMsg().contains("private-internal-detail"), "unknown failure remains sanitized");
            }
            System.out.println("Inner access boundary checks passed: " + checks);
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    private static void classBoundary(StandardEnvironment environment) {
        AspectJProxyFactory factory = new AspectJProxyFactory(new ProtectedClassController());
        factory.setProxyTargetClass(true);
        factory.addAspect(new InnerAspect(environment));
        ProtectedClassController controller = factory.getProxy();
        bind(Map.of());
        denied(controller::draft, "class-level annotation rejects external request");
        bind(internal("cloudflow-service-crm"));
        check("class-draft".equals(controller.draft()), "class-level annotation accepts authorized caller");
    }

    private static void missingParameterChecks() throws Exception {
        Method method = GlobalExceptionHandler.class.getMethod("handleMissingServletRequestParameterException", MissingServletRequestParameterException.class);
        check(method.getAnnotation(ResponseStatus.class).value() == HttpStatus.BAD_REQUEST, "missing parameters map to HTTP 400");
        check(java.util.List.of(method.getAnnotation(ExceptionHandler.class).value()).equals(java.util.List.of(MissingServletRequestParameterException.class)), "only missing parameter exceptions use the new mapping");
        R<?> response = HANDLER.handleMissingServletRequestParameterException(new MissingServletRequestParameterException("customerId", "Long"));
        check(response.getCode() == 400, "missing parameter response has business code 400");
        check("缺少必要参数: customerId".equals(response.getMsg()), "missing parameter message names only the public request field");
    }

    private static Map<String, String> internal(String service) {
        return Map.of(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE,
                SecurityConstants.FROM_SERVICE_HEADER, service);
    }

    private static void bind(Map<String, String> headers) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request(headers)));
    }

    private static HttpServletRequest request(Map<String, String> headers) {
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, (proxy, method, arguments) -> switch (method.getName()) {
                    case "getHeader" -> headers.get(arguments[0]);
                    case "getRemoteAddr" -> "127.0.0.1";
                    case "getRequestURI" -> "/inner/check";
                    case "toString" -> "inner-boundary-request";
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == arguments[0];
                    default -> null;
                });
    }

    private static void denied(Runnable action, String label) {
        try {
            action.run();
            throw new AssertionError(label + " unexpectedly executed");
        } catch (ServiceException exception) {
            check(Integer.valueOf(403).equals(exception.getCode()), label + " carries explicit forbidden code");
            ResponseEntity<R<?>> response = HANDLER.handleServiceException(exception, request(Map.of()));
            check(response.getStatusCode().value() == 403, label + " returns HTTP 403 without proxy wrapping");
            check(response.getBody() != null && response.getBody().getCode() == 403, label + " returns forbidden body");
        }
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    public static class ProtectedController {
        private int calls;

        @Inner(allowedServices = "cloudflow-service-crm")
        public String draft() {
            calls++;
            return "draft";
        }

        @Inner(allowedServices = "${cloudflow.security.inner.check.callers:cloudflow-service-crm}")
        public String configured() {
            return "configured";
        }

        @Inner(false)
        public String publicEndpoint() {
            return "public";
        }

        @Inner(allowedServices = "cloudflow-service-crm")
        public String failure() {
            throw new IllegalStateException("private-internal-detail");
        }
    }

    @Inner(allowedServices = "cloudflow-service-crm")
    public static class ProtectedClassController {
        public String draft() {
            return "class-draft";
        }
    }
}

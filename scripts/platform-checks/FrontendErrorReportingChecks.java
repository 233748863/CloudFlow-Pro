package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.FrontendErrorLog;
import com.cloudflow.oa.service.IFrontendErrorLogService;
import com.cloudflow.oa.service.impl.FrontendErrorLogServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public class FrontendErrorReportingChecks {
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        try {
            controllerChecks();
            publicationChecks();
        } finally {
            UserContext.clear();
        }
        System.out.println("Batch G frontend error reporting checks passed: " + checks);
    }

    private static void controllerChecks() throws Exception {
        AtomicInteger reports = new AtomicInteger();
        IFrontendErrorLogService service = (IFrontendErrorLogService) Proxy.newProxyInstance(
                IFrontendErrorLogService.class.getClassLoader(), new Class<?>[]{IFrontendErrorLogService.class},
                (proxy, method, values) -> {
                    if (method.getName().equals("reportError")) reports.incrementAndGet();
                    return null;
                });
        HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(
                HttpServletRequest.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (proxy, method, values) -> method.getName().equals("getRemoteAddr") ? "127.0.0.1" : null);
        OaProperties.ErrorReportConfig settings = new OaProperties.ErrorReportConfig();
        OaProperties properties = new OaProperties() {
            @Override
            public ErrorReportConfig getErrorReport() {
                return settings;
            }
        };
        ErrorReportController controller = new ErrorReportController(service, properties);
        FrontendErrorLog entry = new FrontendErrorLog();
        entry.setMessage("unit frontend failure");
        entry.setUrl("https://frontend.example.invalid/system/observability");
        UserContext.setUserId(101L);
        controller.report(entry, request);
        check(reports.get() == 1, "authenticated non-dashboard errors pass the default reporting policy");
        Method endpoint = ErrorReportController.class.getMethod("report", FrontendErrorLog.class, HttpServletRequest.class);
        check(List.of(endpoint.getAnnotation(SaCheckPermission.class).value()).equals(List.of("oa:error-report:create")), "reporting endpoint retains its permission guard");
        check(endpoint.isAnnotationPresent(RepeatSubmit.class), "reporting endpoint retains duplicate protection");
        entry.setMessage(" ");
        controller.report(entry, request);
        controller.report(null, request);
        check(reports.get() == 1, "blank and absent reports remain ignored");
        entry.setMessage("unit frontend failure");
        properties.getErrorReport().setEnabled(false);
        controller.report(entry, request);
        check(reports.get() == 1, "disabled reporting remains disabled");
        properties.getErrorReport().setEnabled(true);
        UserContext.clear();
        controller.report(entry, request);
        check(reports.get() == 1, "anonymous reports retain the configured page restriction");
    }

    private static void publicationChecks() throws Exception {
        AtomicReference<FrontendErrorLogServiceImpl.Reported> published = new AtomicReference<>();
        ObjectMapper mapper = new ObjectMapper();
        FrontendErrorLogServiceImpl service = new FrontendErrorLogServiceImpl(
                event -> published.set((FrontendErrorLogServiceImpl.Reported) event), mapper);
        UserContext.setUserId(101L);
        UserContext.setTenantId(100000L);
        UserContext.setUserName("unit-reporter");
        FrontendErrorLog entry = new FrontendErrorLog();
        entry.setId(999L);
        entry.setUserId(999L);
        entry.setTenantId(100001L);
        entry.setUserName("forged-reporter");
        entry.setTraceId("a0123456789abcdef0123456789abcdef");
        entry.setMessage("failure token=unit-sensitive-token");
        entry.setStack("contact 13800138000");
        entry.setTags(Map.of("token", "unit-sensitive-token"));
        entry.setExtra(Map.of("password", "unit-sensitive-password", "idCard", "11010519491231002X"));
        entry.setClientIp("forged-ip");
        service.reportError(entry, "127.0.0.1");
        FrontendErrorLog captured = published.get().entry();
        check(captured.getId() == null && captured.getUserId().equals(101L)
                && captured.getTenantId().equals(100000L) && captured.getUserName().equals("unit-reporter"), "published identity comes from the authenticated context");
        check(captured.getTraceId().equals("a0123456789abcdef0123456789abcdef"), "original valid trace survives asynchronous publication");
        String encoded = mapper.writeValueAsString(Map.of("message", captured.getMessage(), "stack", captured.getStack(), "tags", captured.getTags(), "extra", captured.getExtra()));
        check(List.of("unit-sensitive-token", "unit-sensitive-password", "13800138000", "11010519491231002X").stream().noneMatch(encoded::contains), "secrets and personal data are removed before asynchronous publication");
        check(captured.getCreateTime() != null && captured.getClientIp().equals("127.0.0.1"), "receive time and client address override untrusted input");
        entry.setTraceId("invalid\r\ntrace");
        service.reportError(entry, "127.0.0.1");
        check(published.get().entry().getTraceId() == null, "invalid reported trace is discarded");
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }
}

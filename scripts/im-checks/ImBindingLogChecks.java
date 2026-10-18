package com.cloudflow.auth.im;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.cloudflow.common.core.exception.GlobalExceptionHandler;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.web.HttpMediaTypeNotSupportedException;

public final class ImBindingLogChecks {
    private static int assertions;

    public static void main(String[] arguments) {
        String privateValue = "binding-malformed-private-value";
        Logger logger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> events = new ListAppender<>();
        boolean additive = logger.isAdditive();
        events.start(); logger.setAdditive(false); logger.addAppender(events);
        try {
            for (String prefix : List.of("/system/im/binding", "/auth/system/im/binding")) {
                for (String suffix : List.of("", "/mine/identity", "/mine/confirm", "/" + privateValue)) {
                    Map<String, Object> attributes = new HashMap<>();
                    attributes.put(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE, privateValue);
                    HttpServletRequest request = request(prefix + suffix, attributes);
                    check(SensitiveLogPolicy.isSensitive(request), "unresolved binding request is sensitive");
                    check(SensitiveLogPolicy.requestPath(request).equals("/system/im/binding/**"), "unresolved path never includes supplied data");
                    check(SensitiveLogPolicy.logException(logger, request, new HttpMediaTypeNotSupportedException(privateValue), 415), "pre-handler exception protected");
                    check(!attributes.containsKey(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE), "stale request parameters removed");
                    check(events.list.size() == 1, "one safe diagnostic remains");
                    for (ILoggingEvent event : events.list) {
                        check(!event.getFormattedMessage().contains(privateValue), "exception content absent");
                        check(event.getThrowableProxy() == null, "no raw throwable retained");
                        check(event.getFormattedMessage().contains("/system/im/binding/**"), "fixed route retained");
                    }
                    events.list.clear();
                }
            }
            for (String path : List.of("/system/im/binding-other", "/auth/system/im/bindings", "/system/user/list")) {
                check(!SensitiveLogPolicy.isSensitive(request(path, new HashMap<>())), "unrelated route unchanged");
            }
        } finally { logger.detachAppender(events); logger.setAdditive(additive); events.stop(); }
        System.out.println("G4_IM_BINDING_LOG: assertions=" + assertions + "; failed=0; before_handler_resolution=true; captured_actual_logs=true; raw_exception_leaks=0; http=false");
    }

    private static HttpServletRequest request(String path, Map<String, Object> attributes) {
        return (HttpServletRequest) Proxy.newProxyInstance(ImBindingLogChecks.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (proxy, method, values) -> switch (method.getName()) {
                    case "getRequestURI" -> path;
                    case "getAttribute" -> attributes.get(values[0]);
                    case "setAttribute" -> attributes.put((String) values[0], values[1]);
                    case "removeAttribute" -> attributes.remove(values[0]);
                    default -> null;
                });
    }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
}

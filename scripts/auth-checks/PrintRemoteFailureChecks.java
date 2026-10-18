package com.cloudflow.auth.service.printing;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import feign.FeignException;
import feign.Request;
import feign.Response;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;

/** Regression for real remote failures previously escaping as generic HTTP 500. */
public final class PrintRemoteFailureChecks {
    public static void main(String[] arguments) {
        int checks = 0;
        for (int status : new int[] {400, 403, 404, 409, 500, 503}) {
            Request request = Request.create(Request.HttpMethod.GET, "http://internal/print", Map.of(), null, StandardCharsets.UTF_8, null);
            Response response = Response.builder().request(request).status(status).reason("remote")
                .headers(Map.of()).body("sensitive remote detail", StandardCharsets.UTF_8).build();
            FeignException direct = FeignException.errorStatus("print", response);
            int expected = status < 500 ? status : 503;
            for (Throwable failure : new Throwable[] {direct,
                    new NoFallbackAvailableException("wrapped", new RuntimeException(direct))}) {
                ServiceException translated = PrintRemoteFailures.translate(failure, "安全提示");
                require(translated.getCode() == expected && "安全提示".equals(translated.getMessage()), "safe status " + status);
                WorkflowPrintFieldFilter filter = new WorkflowPrintFieldFilter(data -> {
                    if (failure instanceof RuntimeException runtime) throw runtime;
                    throw new AssertionError("Unexpected checked failure");
                });
                try {
                    filter.filter(new PrintData(100000L, "EXPENSE_CLAIM", "1", "wf", "expense_claim:1", Map.of()));
                    throw new AssertionError("Failed remote permission check must block rendering");
                } catch (ServiceException blocked) {
                    require(blocked.getCode() == expected && "打印字段权限校验失败".equals(blocked.getMessage()), "filter fail closed");
                }
                checks += 2;
            }
        }
        ServiceException unknown = PrintRemoteFailures.translate(new NoFallbackAvailableException("no fallback", null), "安全提示");
        require(unknown.getCode() == 503, "Unknown circuit failure must become unavailable");
        System.out.println("PrintRemoteFailureChecks PASS checks=" + (checks + 1));
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}

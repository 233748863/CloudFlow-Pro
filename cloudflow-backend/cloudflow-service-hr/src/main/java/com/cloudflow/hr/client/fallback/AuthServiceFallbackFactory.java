package com.cloudflow.hr.client.fallback;

import com.cloudflow.hr.client.AuthServiceClient;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthServiceFallbackFactory implements FallbackFactory<AuthServiceClient> {
    private final AuthServiceFallback fallback;

    @Override
    public AuthServiceClient create(Throwable cause) {
        Throwable root = cause;
        int status = -1;
        for (int depth = 0; root != null && depth < 32; depth++) {
            if (root instanceof FeignException response) status = response.status();
            if (root.getCause() == null || root.getCause() == root) break;
            root = root.getCause();
        }
        log.warn("HR_AUTH_CALL_FAILED cause_type={} root_type={} http_status={}",
                cause == null ? "unknown" : cause.getClass().getName(), root == null ? "unknown" : root.getClass().getName(), status);
        return fallback;
    }
}

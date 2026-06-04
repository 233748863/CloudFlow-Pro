package com.cloudflow.auth.handler;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackages = "com.cloudflow.auth")
public class AuthExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AuthExceptionHandler.class);

    @ExceptionHandler(RateLimiterAspect.RateLimitException.class)
    public ResponseEntity<R<?>> handleRateLimitException(RateLimiterAspect.RateLimitException e) {
        log.warn("请求限流: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", "1")
                .body(R.fail(ErrorCodeConstants.TOO_MANY_REQUESTS, e.getMessage()));
    }
}

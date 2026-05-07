package com.cloudflow.auth.handler;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackages = "com.cloudflow.auth")
public class AuthExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(AuthExceptionHandler.class);

    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    @ExceptionHandler(RateLimiterAspect.RateLimitException.class)
    public R<?> handleRateLimitException(RateLimiterAspect.RateLimitException e) {
        log.warn("请求限流: {}", e.getMessage());
        return R.fail(HttpStatus.TOO_MANY_REQUESTS.value(), e.getMessage());
    }
}

package com.cloudflow.hr.exception;

import com.cloudflow.common.core.domain.R;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class HrExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(HrExceptionHandler.class);

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(HrBusinessException.class)
    public R<?> handleHrBusinessException(HrBusinessException e, HttpServletRequest request) {
        log.warn("HR business error - uri={}, code={}, message={}, data={}",
                request.getRequestURI(), e.getCode(), e.getMessage(), e.getData());
        return R.fail(HttpStatus.BAD_REQUEST.value(), e.getMessage());
    }

    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    @ExceptionHandler(HrSystemException.class)
    public R<?> handleHrSystemException(HrSystemException e, HttpServletRequest request) {
        log.error("HR system error - uri={}, code={}, message={}, data={}",
                request.getRequestURI(), e.getCode(), e.getMessage(), e.getData(), e);
        if ("SERVICE_CALL_FAILED".equals(e.getCode())) {
            return R.fail(HttpStatus.SERVICE_UNAVAILABLE.value(), "External service call failed, please retry later");
        }
        return R.fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), "System error, please contact administrator");
    }
}

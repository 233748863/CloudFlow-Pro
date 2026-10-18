package com.cloudflow.crm.exception;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.LogSanitizer;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice(basePackages = "com.cloudflow.crm.controller")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CrmExceptionHandler {
    @ExceptionHandler(CrmBusinessException.class)
    public ResponseEntity<R<?>> handleBusinessException(CrmBusinessException exception, HttpServletRequest request) {
        log.warn("CRM业务操作未通过 - 请求地址: {}, 原因: {}", request.getRequestURI(), LogSanitizer.limit(exception.getMessage(), 2000));
        return ResponseEntity.badRequest().body(R.fail(HttpStatus.BAD_REQUEST.value(), exception.getMessage()));
    }
}

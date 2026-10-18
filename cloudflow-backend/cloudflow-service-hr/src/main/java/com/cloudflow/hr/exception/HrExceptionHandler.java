package com.cloudflow.hr.exception;

import com.cloudflow.common.core.exception.SafeErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HR模块全局异常处理器
 * 处理HR服务特有的业务异常和系统异常
 * 通用异常（RuntimeException、Exception 等）由 cloudflow-common 模块的 GlobalExceptionHandler 处理
 * 
 * @author CloudFlow
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HrExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(HrExceptionHandler.class);

    @ExceptionHandler(com.cloudflow.hr.service.HrHException.class)
    public ResponseEntity<Map<String, Object>> handleHException(com.cloudflow.hr.service.HrHException exception, HttpServletRequest request) {
        log.warn("HR09业务操作未完成 code={}", exception.getCode());
        return ResponseEntity.status(exception.getStatus()).body(buildBody(exception.getCode(), exception.getMessage(), null, request));
    }

    @ExceptionHandler(com.cloudflow.hr.service.HrAppraisalRules.ValidationException.class)
    public ResponseEntity<Map<String, Object>> handleAppraisalValidation(com.cloudflow.hr.service.HrAppraisalRules.ValidationException exception, HttpServletRequest request) {
        log.warn("绩效周期校验未通过");
        return ResponseEntity.badRequest().body(buildBody("APPRAISAL_INVALID_PARAMETER", exception.getMessage(), null, request));
    }

    /**
     * HR业务异常
     * 处理所有业务逻辑错误，如假期额度不足、编制超额、工号重复等
     */
    @ExceptionHandler(HrBusinessException.class)
    public ResponseEntity<Map<String, Object>> handleHrBusinessException(HrBusinessException e, HttpServletRequest request) {
        if (request.getRequestURI().contains("/attendance/overtime-") || request.getRequestURI().contains("/attendance/shift-requests")) {
            log.warn("HR09依赖业务操作未完成 code={}", e.getCode());
            HttpStatus status = "FORBIDDEN".equals(e.getCode()) ? HttpStatus.FORBIDDEN : "HR_RESOURCE_BUSY".equals(e.getCode()) ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.CONFLICT;
            return ResponseEntity.status(status).body(buildBody(e.getCode(), "业务依据或依赖尚未满足，请核查对应错误码", null, request));
        }
        log.warn("HR业务异常 - 请求地址: {}, 错误代码: {}, 错误信息: {}, 附加数据: {}",
                request.getRequestURI(), e.getCode(), e.getMessage(), e.getData());
        HttpStatus status = resolveHrBusinessStatus(e.getCode());
        return ResponseEntity.status(status).body(buildBody(e.getCode(), e.getMessage(), e.getData(), request));
    }

    /**
     * HR系统异常
     * 处理所有系统级错误，如服务调用失败、数据同步失败等
     */
    @ExceptionHandler(HrSystemException.class)
    public ResponseEntity<Map<String, Object>> handleHrSystemException(HrSystemException e, HttpServletRequest request) {
        log.error("HR系统异常 - 请求地址: {}, 错误代码: {}, 错误信息: {}, 附加数据: {}",
                request.getRequestURI(), e.getCode(), e.getMessage(), e.getData(), e);
        HttpStatus status = "SERVICE_CALL_FAILED".equals(e.getCode())
                ? HttpStatus.SERVICE_UNAVAILABLE
                : HttpStatus.INTERNAL_SERVER_ERROR;
        String message = status == HttpStatus.SERVICE_UNAVAILABLE
                ? e.getMessage()
                : SafeErrorResponse.withTraceId("系统异常，请联系管理员");
        return ResponseEntity.status(status).body(buildBody(e.getCode(), message, e.getData(), request));
    }

    private HttpStatus resolveHrBusinessStatus(String code) {
        if (code == null || code.isBlank()) {
            return HttpStatus.BAD_REQUEST;
        }
        return switch (code) {
            case "UNAUTHORIZED" -> HttpStatus.UNAUTHORIZED;
            case "FORBIDDEN", "FORBIDDEN_CROSS_EMPLOYEE" -> HttpStatus.FORBIDDEN;
            default -> code.endsWith("_NOT_FOUND") ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        };
    }

    private Map<String, Object> buildBody(String code, String message, Map<String, Object> data, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        body.put("data", data);
        body.put("timestamp", LocalDateTime.now());
        body.put("path", request.getRequestURI());
        return body;
    }
}

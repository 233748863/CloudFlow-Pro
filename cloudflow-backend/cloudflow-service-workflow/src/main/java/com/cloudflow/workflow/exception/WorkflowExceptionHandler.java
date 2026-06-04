package com.cloudflow.workflow.exception;

import com.cloudflow.common.core.exception.SafeErrorResponse;
import com.cloudflow.workflow.domain.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 工作流模块异常处理器
 * 处理工作流特有的异常类型（WorkflowException、ValidationException、BusinessException、NotFoundException 等）
 * 通用异常（RuntimeException、Exception 等）由 cloudflow-common 模块的 GlobalExceptionHandler 处理
 * 
 * @author CloudFlow
 */
@RestControllerAdvice
public class WorkflowExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(WorkflowExceptionHandler.class);

    /**
     * 工作流业务异常
     */
    @ExceptionHandler(WorkflowException.class)
    public ResponseEntity<ErrorResponse> handleWorkflowException(WorkflowException e, HttpServletRequest request) {
        log.warn("工作流业务异常 [{}]: {}", e.getCode(), e.getMessage());
        HttpStatus status = resolveWorkflowExceptionStatus(e.getCode());
        return buildResponse(status, e.getCode(), e.getMessage(), null, null, request);
    }

    /**
     * 验证异常
     * 返回标准化错误响应格式，包含字段级别的错误信息
     */
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException e, HttpServletRequest request) {
        log.warn("验证异常 [{}]: {}", e.getCode(), e.getMessage());
        return buildResponse(HttpStatus.BAD_REQUEST, e.getCode(), e.getMessage(), e.getFieldErrors(), e.getData(), request);
    }

    /**
     * 业务异常
     * 返回标准化错误响应格式
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e, HttpServletRequest request) {
        log.warn("业务异常 [{}]: {}", e.getCode(), e.getMessage());
        if (e.getData() != null) {
            log.debug("业务异常附加数据: {}", e.getData());
        }
        HttpStatus status = resolveBusinessExceptionStatus(e.getCode());
        return buildResponse(status, e.getCode(), e.getMessage(), null, e.getData(), request);
    }

    /**
     * 资源不存在异常
     * 返回 404 状态码
     */
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFoundException(NotFoundException e, HttpServletRequest request) {
        log.warn("资源不存在 [{}]: {}", e.getCode(), e.getMessage());
        return buildResponse(HttpStatus.NOT_FOUND, e.getCode(), e.getMessage(), null, null, request);
    }

    /**
     * 权限不足异常（自定义异常）
     * 返回 403 状态码和明确的权限错误提示
     */
    @ExceptionHandler(PermissionDeniedException.class)
    public ResponseEntity<ErrorResponse> handlePermissionDeniedException(PermissionDeniedException e, HttpServletRequest request) {
        String requestURI = request.getRequestURI();
        log.warn("权限不足 - 请求地址: {}, 错误信息: {}", requestURI, e.getMessage());
        return buildResponse(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", e.getMessage(), null, null, request);
    }

    /**
     * 限流异常
     */
    @ExceptionHandler(RateLimitException.class)
    public ResponseEntity<ErrorResponse> handleRateLimitException(RateLimitException e, HttpServletRequest request) {
        log.warn("请求限流: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", "1")
                .body(ErrorResponse.builder()
                        .code("RATE_LIMIT_EXCEEDED")
                        .message(e.getMessage())
                        .path(request.getRequestURI())
                        .build());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnhandledException(Exception e, HttpServletRequest request) {
        log.error("工作流未处理异常, uri={}", request.getRequestURI(), e);
        return buildResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "WORKFLOW_INTERNAL_ERROR",
                SafeErrorResponse.withTraceId("工作流服务异常，请联系管理员"),
                null,
                null,
                request
        );
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatus status,
            String code,
            String message,
            java.util.List<ErrorResponse.FieldError> errors,
            java.util.Map<String, Object> data,
            HttpServletRequest request
    ) {
        ErrorResponse body = ErrorResponse.builder()
                .code(code == null || code.isBlank() ? defaultCode(status) : code)
                .message(message)
                .errors(errors)
                .data(data)
                .path(request.getRequestURI())
                .build();
        return ResponseEntity.status(status).body(body);
    }

    private HttpStatus resolveWorkflowExceptionStatus(String code) {
        if (code == null || code.isBlank()) {
            return HttpStatus.BAD_REQUEST;
        }
        if (code.endsWith("_NOT_FOUND")) {
            return HttpStatus.NOT_FOUND;
        }
        return switch (code) {
            case "PERMISSION_DENIED" -> HttpStatus.FORBIDDEN;
            case "RATE_LIMIT_EXCEEDED" -> HttpStatus.TOO_MANY_REQUESTS;
            case "SYSTEM_BUSY", "INVALID_STATE" -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
    }

    private HttpStatus resolveBusinessExceptionStatus(String code) {
        if (code == null || code.isBlank()) {
            return HttpStatus.BAD_REQUEST;
        }
        return switch (code) {
            case "RUNNING_INSTANCES_WARNING", "RESOURCE_CONFLICT", "TEMPLATE_IN_USE", "INVALID_STATE" -> HttpStatus.CONFLICT;
            case "PERMISSION_DENIED" -> HttpStatus.FORBIDDEN;
            default -> code.endsWith("_NOT_FOUND") ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        };
    }

    private String defaultCode(HttpStatus status) {
        return switch (status) {
            case NOT_FOUND -> "RESOURCE_NOT_FOUND";
            case FORBIDDEN -> "PERMISSION_DENIED";
            case TOO_MANY_REQUESTS -> "RATE_LIMIT_EXCEEDED";
            case INTERNAL_SERVER_ERROR -> "WORKFLOW_INTERNAL_ERROR";
            default -> "INVALID_REQUEST";
        };
    }
}

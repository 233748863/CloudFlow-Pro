package com.cloudflow.workflow.exception;

import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.workflow.domain.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.PessimisticLockingFailureException;
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
@Order(Ordered.HIGHEST_PRECEDENCE)
public class WorkflowExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(WorkflowExceptionHandler.class);

    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleLockConflict(PessimisticLockingFailureException failure, HttpServletRequest request) {
        log.warn("工作流并发事务已回滚，请求地址={}", SensitiveLogPolicy.requestPath(request));
        return buildResponse(HttpStatus.CONFLICT, "TASK_VERSION_CONFLICT", "任务或代理设置正在变更，本次操作已回滚，请重新读取后重试", null, null, request);
    }

    /**
     * 工作流业务异常
     */
    @ExceptionHandler(WorkflowException.class)
    public ResponseEntity<ErrorResponse> handleWorkflowException(WorkflowException e, HttpServletRequest request) {
        if (SensitiveLogPolicy.logException(log, request, e, e.getCode())) {
            ResponseEntity<ErrorResponse> response = sensitiveResponse(resolveWorkflowExceptionStatus(e.getCode()), e.getCode(), request);
            if (e instanceof WorkflowFormValidationException formException) {
                response.getBody().setErrors(formException.getResponseFieldErrors());
            }
            return response;
        }
        log.warn("工作流业务异常 [{}]: {}", e.getCode(), e.getMessage());
        HttpStatus status = resolveWorkflowExceptionStatus(e.getCode());
        return buildResponse(status, e.getCode(), e.getMessage(),
                e instanceof WorkflowFormValidationException formException ? formException.getResponseFieldErrors() : null, null, request);
    }

    /**
     * 验证异常
     * 返回标准化错误响应格式，包含字段级别的错误信息
     */
    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(ValidationException e, HttpServletRequest request) {
        if (SensitiveLogPolicy.logException(log, request, e, e.getCode())) {
            return sensitiveResponse(HttpStatus.BAD_REQUEST, e.getCode(), request);
        }
        log.warn("验证异常 [{}]: {}", e.getCode(), e.getMessage());
        return buildResponse(HttpStatus.BAD_REQUEST, e.getCode(), e.getMessage(), e.getFieldErrors(), e.getData(), request);
    }

    /**
     * 业务异常
     * 返回标准化错误响应格式
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e, HttpServletRequest request) {
        if (SensitiveLogPolicy.logException(log, request, e, e.getCode())) {
            return sensitiveResponse(resolveBusinessExceptionStatus(e.getCode()), e.getCode(), request);
        }
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
        if (SensitiveLogPolicy.logException(log, request, e, e.getCode())) {
            return sensitiveResponse(HttpStatus.NOT_FOUND, e.getCode(), request);
        }
        log.warn("资源不存在 [{}]: {}", e.getCode(), e.getMessage());
        return buildResponse(HttpStatus.NOT_FOUND, e.getCode(), e.getMessage(), null, null, request);
    }

    /**
     * 权限不足异常（自定义异常）
     * 返回 403 状态码和明确的权限错误提示
     */
    @ExceptionHandler(PermissionDeniedException.class)
    public ResponseEntity<ErrorResponse> handlePermissionDeniedException(PermissionDeniedException e, HttpServletRequest request) {
        if (SensitiveLogPolicy.logException(log, request, e, "PERMISSION_DENIED")) {
            return sensitiveResponse(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", request);
        }
        String requestURI = request.getRequestURI();
        log.warn("权限不足 - 请求地址: {}, 错误信息: {}", requestURI, e.getMessage());
        return buildResponse(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", e.getMessage(), null, null, request);
    }

    /**
     * 限流异常
     */
    @ExceptionHandler(RateLimitException.class)
    public ResponseEntity<ErrorResponse> handleRateLimitException(RateLimitException e, HttpServletRequest request) {
        if (SensitiveLogPolicy.logException(log, request, e, "RATE_LIMIT_EXCEEDED")) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "1")
                    .body(sensitiveResponse(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED", request).getBody());
        }
        log.warn("请求限流: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", "1")
                .body(ErrorResponse.builder()
                        .code("RATE_LIMIT_EXCEEDED")
                        .message(e.getMessage())
                        .path(request.getRequestURI())
                        .build());
    }

    private ResponseEntity<ErrorResponse> sensitiveResponse(HttpStatus status, String code, HttpServletRequest request) {
        String safeCode = code == null || code.isBlank() ? defaultCode(status) : SensitiveLogPolicy.safeCode(code);
        status = switch (safeCode) {
            case "DRAFT_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "DRAFT_CONFLICT", "DRAFT_STALE", "FORM_VERSION_CONFLICT" -> HttpStatus.CONFLICT;
            case "FORM_FILE_UNAVAILABLE" -> HttpStatus.SERVICE_UNAVAILABLE;
            case "DRAFT_EXPIRED" -> HttpStatus.GONE;
            case "DRAFT_UNAVAILABLE" -> HttpStatus.FORBIDDEN;
            case "DRAFT_TOO_LARGE" -> HttpStatus.PAYLOAD_TOO_LARGE;
            case "DRAFT_INVALID_DATA", "FORM_INVALID_DATA", "FORM_INVALID_DEFINITION", "FORM_UNSUPPORTED_FIELD_TYPE", "FORM_UNSUPPORTED_VALIDATION" -> HttpStatus.BAD_REQUEST;
            default -> status;
        };
        String message = switch (safeCode) {
            case "DRAFT_NOT_FOUND" -> "草稿不存在或无权访问";
            case "DRAFT_CONFLICT" -> "草稿已被更新，请刷新后重试";
            case "DRAFT_EXPIRED" -> "草稿已过期，请重新填写";
            case "DRAFT_STALE" -> "流程配置已变更，请重新确认";
            case "DRAFT_UNAVAILABLE" -> "当前流程暂不可发起";
            case "DRAFT_TOO_LARGE" -> "草稿内容超过允许大小";
            case "DRAFT_INVALID_DATA" -> "草稿数据不符合要求，请检查后重试";
            case "FORM_INVALID_DATA" -> "表单数据不符合要求，请检查后重试";
            case "FORM_INVALID_DEFINITION" -> "表单配置无效，请联系管理员";
            case "FORM_UNSUPPORTED_FIELD_TYPE" -> "表单包含暂不支持的字段类型";
            case "FORM_UNSUPPORTED_VALIDATION" -> "表单包含暂不支持的校验规则";
            default -> switch (status) {
                case NOT_FOUND -> "请求资源不存在或无权访问";
                case FORBIDDEN -> "无权访问当前资源";
                case TOO_MANY_REQUESTS -> "请求过于频繁，请稍后重试";
                case CONFLICT -> "当前状态不允许此操作，请刷新后重试";
                default -> "请求参数校验失败";
            };
        };
        return ResponseEntity.status(status).body(ErrorResponse.builder()
                .code(safeCode).message(message).path(SensitiveLogPolicy.requestPath(request)).build());
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
            case "PERMISSION_DENIED", "AGENT_FORBIDDEN" -> HttpStatus.FORBIDDEN;
            case "RATE_LIMIT_EXCEEDED" -> HttpStatus.TOO_MANY_REQUESTS;
            case "SYSTEM_BUSY", "INVALID_STATE", "AGENT_SETTING_CONFLICT", "TASK_VERSION_CONFLICT" -> HttpStatus.CONFLICT;
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

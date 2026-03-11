package com.cloudflow.workflow.exception;

import com.cloudflow.common.core.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;

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
    public R<?> handleWorkflowException(WorkflowException e) {
        log.warn("工作流业务异常 [{}]: {}", e.getCode(), e.getMessage());
        return R.fail(e.getCode() + ": " + e.getMessage());
    }

    /**
     * 验证异常
     * 返回标准化错误响应格式，包含字段级别的错误信息
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(ValidationException.class)
    public R<?> handleValidationException(ValidationException e) {
        log.warn("验证异常 [{}]: {}", e.getCode(), e.getMessage());
        
        // 构建包含字段错误信息的消息
        StringBuilder message = new StringBuilder(e.getMessage());
        if (e.getFieldErrors() != null && !e.getFieldErrors().isEmpty()) {
            message.append(" - 字段错误: ");
            e.getFieldErrors().forEach(error -> 
                message.append(error.getField()).append(": ").append(error.getMessage()).append("; ")
            );
        }
        
        return R.fail(HttpStatus.BAD_REQUEST.value(), message.toString());
    }

    /**
     * 业务异常
     * 返回标准化错误响应格式
     */
    @ExceptionHandler(BusinessException.class)
    public R<?> handleBusinessException(BusinessException e) {
        log.warn("业务异常 [{}]: {}", e.getCode(), e.getMessage());
        
        // 如果有附加数据，记录到日志中
        if (e.getData() != null) {
            log.debug("业务异常附加数据: {}", e.getData());
        }
        
        return R.fail(e.getCode() + ": " + e.getMessage());
    }

    /**
     * 资源不存在异常
     * 返回 404 状态码
     */
    @ResponseStatus(HttpStatus.NOT_FOUND)
    @ExceptionHandler(NotFoundException.class)
    public R<?> handleNotFoundException(NotFoundException e) {
        log.warn("资源不存在 [{}]: {}", e.getCode(), e.getMessage());
        return R.fail(HttpStatus.NOT_FOUND.value(), e.getMessage());
    }

    /**
     * 权限不足异常（自定义异常）
     * 返回 403 状态码和明确的权限错误提示
     */
    @ResponseStatus(HttpStatus.FORBIDDEN)
    @ExceptionHandler(PermissionDeniedException.class)
    public R<?> handlePermissionDeniedException(PermissionDeniedException e, HttpServletRequest request) {
        String requestURI = request.getRequestURI();
        log.warn("权限不足 - 请求地址: {}, 错误信息: {}", requestURI, e.getMessage());
        return R.fail(HttpStatus.FORBIDDEN.value(), "权限不足: " + e.getMessage());
    }

    /**
     * 限流异常
     */
    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    @ExceptionHandler(RateLimitException.class)
    public R<?> handleRateLimitException(RateLimitException e) {
        log.warn("请求限流: {}", e.getMessage());
        return R.fail(HttpStatus.TOO_MANY_REQUESTS.value(), "操作过于频繁，请稍后再试");
    }
}

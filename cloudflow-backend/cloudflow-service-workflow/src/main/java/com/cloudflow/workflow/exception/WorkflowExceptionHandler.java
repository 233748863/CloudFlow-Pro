package com.cloudflow.workflow.exception;

import com.cloudflow.common.core.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 工作流模块异常处理器
 * 处理工作流特有的异常类型（WorkflowException、PermissionDeniedException、RateLimitException）
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
     * 权限不足异常
     */
    @ExceptionHandler(PermissionDeniedException.class)
    public R<?> handlePermissionDeniedException(PermissionDeniedException e) {
        log.warn("权限不足: {}", e.getMessage());
        return R.fail("权限不足: " + e.getMessage());
    }

    /**
     * 限流异常
     */
    @ExceptionHandler(RateLimitException.class)
    public R<?> handleRateLimitException(RateLimitException e) {
        log.warn("请求限流: {}", e.getMessage());
        return R.fail("操作过于频繁，请稍后再试");
    }
}

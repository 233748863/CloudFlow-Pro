package com.cloudflow.workflow.exception;

import com.cloudflow.common.core.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 全局异常处理器
 * 
 * @author CloudFlow
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

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

    /**
     * 参数校验异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public R<?> handleIllegalArgumentException(IllegalArgumentException e) {
        log.warn("参数校验失败: {}", e.getMessage());
        return R.fail("参数错误: " + e.getMessage());
    }

    /**
     * 运行时异常
     */
    @ExceptionHandler(RuntimeException.class)
    public R<?> handleRuntimeException(RuntimeException e) {
        log.error("运行时异常: ", e);
        return R.fail("系统内部错误，请联系管理员");
    }

    /**
     * 未知异常
     */
    @ExceptionHandler(Exception.class)
    public R<?> handleException(Exception e) {
        log.error("未知异常: ", e);
        return R.fail("系统异常，请联系管理员");
    }
}

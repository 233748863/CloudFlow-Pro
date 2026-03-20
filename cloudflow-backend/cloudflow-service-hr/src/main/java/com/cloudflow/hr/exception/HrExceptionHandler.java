package com.cloudflow.hr.exception;

import com.cloudflow.common.core.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;

/**
 * HR模块全局异常处理器
 * 处理HR服务特有的业务异常和系统异常
 * 通用异常（RuntimeException、Exception 等）由 cloudflow-common 模块的 GlobalExceptionHandler 处理
 * 
 * @author CloudFlow
 */
@RestControllerAdvice
public class HrExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(HrExceptionHandler.class);

    /**
     * HR业务异常
     * 处理所有业务逻辑错误，如假期额度不足、编制超额、工号重复等
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(HrBusinessException.class)
    public R<?> handleHrBusinessException(HrBusinessException e, HttpServletRequest request) {
        log.warn("HR业务异常 - 请求地址: {}, 错误代码: {}, 错误信息: {}, 附加数据: {}", 
                request.getRequestURI(), e.getCode(), e.getMessage(), e.getData());
        return R.fail(HttpStatus.BAD_REQUEST.value(), e.getMessage());
    }

    /**
     * HR系统异常
     * 处理所有系统级错误，如服务调用失败、数据同步失败等
     */
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    @ExceptionHandler(HrSystemException.class)
    public R<?> handleHrSystemException(HrSystemException e, HttpServletRequest request) {
        log.error("HR系统异常 - 请求地址: {}, 错误代码: {}, 错误信息: {}, 附加数据: {}", 
                request.getRequestURI(), e.getCode(), e.getMessage(), e.getData(), e);
        
        // 对于服务调用失败，返回503状态码
        if ("SERVICE_CALL_FAILED".equals(e.getCode())) {
            return R.fail(HttpStatus.SERVICE_UNAVAILABLE.value(), "外部服务调用失败，请稍后重试");
        }
        
        // 其他系统异常返回500状态码
        return R.fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), "系统异常，请联系管理员");
    }
}

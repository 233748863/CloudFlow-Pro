package cn.joywon.poco.merchant.ProductModule.exception;

import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.util.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

/**
 * 商品模块异常处理器
 * 用于捕获和处理商品相关的异常，特别是参数验证异常
 * 
 * @author poco
 * @date 2025-01-23
 */
@Slf4j
@Order(1)  // 优先级高于全局异常处理器
@RestControllerAdvice(basePackages = "cn.joywon.poco.merchant.ProductModule")
public class ProductExceptionHandler {

    /**
     * 处理 @Valid 参数校验异常（用于 @RequestBody）
     * 在异常发生时打印完整的请求参数，方便调试
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleMethodArgumentNotValidException(MethodArgumentNotValidException e, HttpServletRequest request) {
        // 打印请求信息
        log.error("========== 商品参数验证失败 ==========");
        log.error("请求URI: {}", request.getRequestURI());
        log.error("请求方法: {}", request.getMethod());
        
        // 打印验证失败的对象
        Object target = e.getBindingResult().getTarget();
        if (target != null) {
            log.error("请求参数（JSON格式）: {}", JSONUtil.toJsonPrettyStr(target));
        }
        
        // 收集所有验证错误信息
        StringBuilder errorMsg = new StringBuilder("参数校验失败: ");
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            errorMsg.append(String.format("[%s: %s] ", 
                    fieldError.getField(), 
                    fieldError.getDefaultMessage()));
            
            // 打印每个字段的验证失败详情
            log.error("  字段 [{}] 验证失败: 当前值={}, 错误信息={}", 
                    fieldError.getField(), 
                    fieldError.getRejectedValue(), 
                    fieldError.getDefaultMessage());
        }
        log.error("========================================");
        
        return R.failed(errorMsg.toString());
    }

    /**
     * 处理绑定异常（用于 @ModelAttribute）
     */
    @ExceptionHandler(BindException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleBindException(BindException e, HttpServletRequest request) {
        log.error("========== 商品参数绑定失败 ==========");
        log.error("请求URI: {}", request.getRequestURI());
        
        // 打印绑定失败的对象
        Object target = e.getBindingResult().getTarget();
        if (target != null) {
            log.error("请求参数: {}", JSONUtil.toJsonPrettyStr(target));
        }
        
        StringBuilder errorMsg = new StringBuilder("参数绑定失败: ");
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            errorMsg.append(String.format("[%s: %s] ", 
                    fieldError.getField(), 
                    fieldError.getDefaultMessage()));
            
            log.error("  字段 [{}] 绑定失败: 当前值={}, 错误信息={}", 
                    fieldError.getField(), 
                    fieldError.getRejectedValue(), 
                    fieldError.getDefaultMessage());
        }
        log.error("========================================");
        
        return R.failed(errorMsg.toString());
    }

    /**
     * 处理约束违反异常（用于 @Validated 方法参数）
     */
    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleConstraintViolationException(ConstraintViolationException e, HttpServletRequest request) {
        log.error("========== 商品约束验证失败 ==========");
        log.error("请求URI: {}", request.getRequestURI());
        log.error("约束违反详情: {}", e.getMessage());
        
        StringBuilder errorMsg = new StringBuilder("约束验证失败: ");
        e.getConstraintViolations().forEach(violation -> {
            errorMsg.append(String.format("[%s: %s] ", 
                    violation.getPropertyPath(), 
                    violation.getMessage()));
            
            log.error("  路径 [{}] 验证失败: 当前值={}, 错误信息={}", 
                    violation.getPropertyPath(), 
                    violation.getInvalidValue(), 
                    violation.getMessage());
        });
        log.error("========================================");
        
        return R.failed(errorMsg.toString());
    }

    /**
     * 处理非法参数异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleIllegalArgumentException(IllegalArgumentException e, HttpServletRequest request) {
        log.error("========== 商品参数非法 ==========");
        log.error("请求URI: {}", request.getRequestURI());
        log.error("错误信息: {}", e.getMessage());
        log.error("========================================");
        
        return R.failed(e.getMessage());
    }
}

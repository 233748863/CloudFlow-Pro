package com.cloudflow.common.core.exception;

import com.cloudflow.common.core.domain.R;
import org.slf4j.MDC;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DeadlockLoserDataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

import java.sql.SQLException;
import java.util.UUID;

/**
 * 全局异常处理器
 * 仅在 Servlet 环境下生效（排除 WebFlux 网关等响应式应用）
 * 处理通用异常，不包含 Spring Security 相关异常（由各模块自行处理）
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 业务异常
     */
    @ExceptionHandler(ServiceException.class)
    public ResponseEntity<R<?>> handleServiceException(ServiceException e, HttpServletRequest request) {
        log.error("业务异常: {}", e.getMessage());
        Integer code = e.getCode();
        int status = resolveHttpStatus(code, HttpStatus.BAD_REQUEST.value());
        R<?> body = R.fail(code != null ? code : status, e.getMessage());
        return ResponseEntity.status(status).body(body);
    }

    /**
     * 参数校验异常
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    public R<?> handleMethodArgumentNotValidException(org.springframework.web.bind.MethodArgumentNotValidException e) {
        log.error(e.getMessage());
        String message = e.getBindingResult().getFieldError().getDefaultMessage();
        return R.fail(HttpStatus.BAD_REQUEST.value(), message);
    }

    /**
     * Query/Form 参数绑定异常。
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(BindException.class)
    public R<?> handleBindException(BindException e) {
        log.error(e.getMessage());
        String message = e.getBindingResult().getFieldError() != null
                ? e.getBindingResult().getFieldError().getDefaultMessage()
                : "请求参数错误";
        return R.fail(HttpStatus.BAD_REQUEST.value(), message);
    }

    /**
     * 方法级约束校验异常，例如 @RequestParam、@PathVariable 上的校验失败。
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(ConstraintViolationException.class)
    public R<?> handleConstraintViolationException(ConstraintViolationException e) {
        log.error(e.getMessage());
        String message = e.getConstraintViolations().stream()
                .findFirst()
                .map(violation -> violation.getMessage())
                .orElse("请求参数错误");
        return R.fail(HttpStatus.BAD_REQUEST.value(), message);
    }

    /**
     * 参数类型不匹配，例如把字符串传给 Long。
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public R<?> handleMethodArgumentTypeMismatchException(MethodArgumentTypeMismatchException e) {
        log.error(e.getMessage());
        String message = "参数 " + e.getName() + " 类型错误";
        return R.fail(HttpStatus.BAD_REQUEST.value(), message);
    }

    /**
     * 请求体无法反序列化，例如非法 JSON、日期格式错误等。
     */
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public R<?> handleHttpMessageNotReadableException(HttpMessageNotReadableException e) {
        log.error(e.getMessage());
        return R.fail(HttpStatus.BAD_REQUEST.value(), "请求体格式错误");
    }

    /**
     * 请求方式不匹配时，返回准确的 405，避免被通用异常分支包装成 500。
     * 例如：接口只支持 POST，却误发成 GET 或 PUT。
     */
    @ResponseStatus(HttpStatus.METHOD_NOT_ALLOWED)
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public R<?> handleHttpRequestMethodNotSupportedException(HttpRequestMethodNotSupportedException e, HttpServletRequest request) {
        String[] supportedMethods = e.getSupportedMethods();
        String allowedMethods = supportedMethods == null || supportedMethods.length == 0
            ? ""
            : String.join(", ", supportedMethods);
        log.warn("请求地址'{}', 请求方式'{}'不支持, 支持方式: {}", request.getRequestURI(), e.getMethod(), allowedMethods);
        String message = allowedMethods.isEmpty()
            ? "请求方法不支持"
            : "请求方法不支持，请使用: " + allowedMethods;
        return R.fail(HttpStatus.METHOD_NOT_ALLOWED.value(), message);
    }

    @ExceptionHandler({
            DuplicateKeyException.class,
            OptimisticLockingFailureException.class,
            CannotAcquireLockException.class,
            DeadlockLoserDataAccessException.class
    })
    public ResponseEntity<R<?>> handleConcurrentException(Exception e, HttpServletRequest request) {
        log.warn("请求地址'{}',发生并发冲突: {}", request.getRequestURI(), e.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(R.fail(ErrorCodeConstants.CONCURRENT_MODIFICATION, "数据已被其他请求更新，请刷新后重试"));
    }

    @ExceptionHandler({SQLException.class, DataAccessException.class})
    public ResponseEntity<R<?>> handleDatabaseException(Exception e, HttpServletRequest request) {
        log.error("请求地址'{}',发生数据库异常.", request.getRequestURI(), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(R.fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), "服务异常，请联系管理员，traceId=" + traceId()));
    }

    @ExceptionHandler(UnsupportedOperationException.class)
    public ResponseEntity<R<?>> handleUnsupportedOperationException(UnsupportedOperationException e, HttpServletRequest request) {
        if (e.getMessage() != null && e.getMessage().contains("ERR.AUDIT_IMMUTABLE")) {
            log.warn("请求地址'{}',命中日志不可变保护: {}", request.getRequestURI(), e.getMessage());
            return ResponseEntity.status(HttpStatus.GONE)
                    .body(R.fail(HttpStatus.GONE.value(), "日志不可删除"));
        }
        log.error("请求地址'{}',发生不支持操作异常.", request.getRequestURI(), e);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(R.fail(HttpStatus.BAD_REQUEST.value(), "当前操作不被支持"));
    }

    @ExceptionHandler(RuntimeException.class)
    public R<?> handleRuntimeException(RuntimeException e, HttpServletRequest request) {
        if (isRateLimitException(e)) {
            throw e;
        }
        log.error("请求地址'{}',发生未知异常.", request.getRequestURI(), e);
        if (isAccessDenied(e)) {
            return R.fail(ErrorCodeConstants.FORBIDDEN, "无权访问当前资源");
        }
        return R.fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), "服务异常，请联系管理员，traceId=" + traceId());
    }

    @ExceptionHandler(Exception.class)
    public R<?> handleException(Exception e, HttpServletRequest request) {
        if (isRateLimitException(e)) {
            throw new RuntimeException(e);
        }
        log.error("请求地址'{}',发生系统异常.", request.getRequestURI(), e);
        if (isAccessDenied(e)) {
            return R.fail(ErrorCodeConstants.FORBIDDEN, "无权访问当前资源");
        }
        return R.fail(HttpStatus.INTERNAL_SERVER_ERROR.value(), "服务异常，请联系管理员，traceId=" + traceId());
    }

    @ExceptionHandler(Throwable.class)
    public ResponseEntity<R<?>> handleRateLimitThrowable(Throwable e, HttpServletRequest request) throws Throwable {
        if (!isRateLimitException(e)) {
            throw e;
        }
        log.warn("请求地址'{}',触发限流: {}", request.getRequestURI(), e.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", "1")
                .body(R.fail(HttpStatus.TOO_MANY_REQUESTS.value(), e.getMessage()));
    }

    private int resolveHttpStatus(Integer code, int defaultStatus) {
        if (code == null) {
            return defaultStatus;
        }
        return HttpStatus.resolve(code) != null ? code : defaultStatus;
    }

    private String traceId() {
        String traceId = MDC.get("traceId");
        return traceId != null && !traceId.isBlank() ? traceId : UUID.randomUUID().toString();
    }

    private boolean isAccessDenied(Throwable throwable) {
        return throwable != null
                && "org.springframework.security.access.AccessDeniedException".equals(throwable.getClass().getName());
    }

    private boolean isRateLimitException(Throwable throwable) {
        return throwable != null
                && "com.cloudflow.common.ratelimiter.aspectj.RateLimiterAspect$RateLimitException".equals(throwable.getClass().getName());
    }
}

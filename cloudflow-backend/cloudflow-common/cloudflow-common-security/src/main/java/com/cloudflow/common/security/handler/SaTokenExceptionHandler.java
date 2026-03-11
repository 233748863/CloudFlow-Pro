package com.cloudflow.common.security.handler;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import cn.dev33.satoken.exception.NotRoleException;
import com.cloudflow.common.core.domain.R;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Sa-Token 异常处理器。
 */
@RestControllerAdvice
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SaTokenExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(SaTokenExceptionHandler.class);

    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    @ExceptionHandler(NotLoginException.class)
    public R<?> handleNotLoginException(NotLoginException e, HttpServletRequest request) {
        log.warn("登录态校验失败 - 请求地址: {}, 错误信息: {}", request.getRequestURI(), e.getMessage());
        return R.fail(HttpStatus.UNAUTHORIZED.value(), "登录状态已失效，请重新登录");
    }

    @ResponseStatus(HttpStatus.FORBIDDEN)
    @ExceptionHandler(NotPermissionException.class)
    public R<?> handleNotPermissionException(NotPermissionException e, HttpServletRequest request) {
        log.warn("权限校验失败 - 请求地址: {}, 错误信息: {}", request.getRequestURI(), e.getMessage());
        return R.fail(HttpStatus.FORBIDDEN.value(), "权限不足：" + e.getPermission());
    }

    @ResponseStatus(HttpStatus.FORBIDDEN)
    @ExceptionHandler(NotRoleException.class)
    public R<?> handleNotRoleException(NotRoleException e, HttpServletRequest request) {
        log.warn("角色校验失败 - 请求地址: {}, 错误信息: {}", request.getRequestURI(), e.getMessage());
        return R.fail(HttpStatus.FORBIDDEN.value(), "角色不足：" + e.getRole());
    }
}

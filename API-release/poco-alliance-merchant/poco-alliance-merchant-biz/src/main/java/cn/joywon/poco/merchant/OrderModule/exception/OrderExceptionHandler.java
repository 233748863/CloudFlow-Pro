/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.exception;

import cn.joywon.poco.common.core.util.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.sql.SQLException;
import java.util.Set;

/**
 * 订单模块异常处理器
 *
 * @author poco
 * @date 2025-11-02
 */
@Slf4j
@RestControllerAdvice(basePackages = "cn.joywon.poco.merchant.OrderModule")
public class OrderExceptionHandler {

    /**
     * 处理订单业务异常
     */
    @ExceptionHandler(OrderBusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleOrderBusinessException(OrderBusinessException e) {
        log.warn("订单业务异常: {}", e.getMessage());
        return R.failed(e.getMessage());
    }

    /**
     * 处理参数校验异常
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleMethodArgumentNotValidException(MethodArgumentNotValidException e) {
        StringBuilder errorMsg = new StringBuilder("参数校验失败: ");
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            errorMsg.append(fieldError.getField())
                    .append(" ")
                    .append(fieldError.getDefaultMessage())
                    .append("; ");
        }
        log.warn("订单参数校验异常: {}", errorMsg.toString());
        return R.failed(errorMsg.toString());
    }

    /**
     * 处理绑定异常
     */
    @ExceptionHandler(BindException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleBindException(BindException e) {
        StringBuilder errorMsg = new StringBuilder("参数绑定失败: ");
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            errorMsg.append(fieldError.getField())
                    .append(" ")
                    .append(fieldError.getDefaultMessage())
                    .append("; ");
        }
        log.warn("订单参数绑定异常: {}", errorMsg.toString());
        return R.failed(errorMsg.toString());
    }

    /**
     * 处理约束违反异常
     */
    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleConstraintViolationException(ConstraintViolationException e) {
        StringBuilder errorMsg = new StringBuilder("约束违反: ");
        Set<ConstraintViolation<?>> violations = e.getConstraintViolations();
        for (ConstraintViolation<?> violation : violations) {
            errorMsg.append(violation.getPropertyPath())
                    .append(" ")
                    .append(violation.getMessage())
                    .append("; ");
        }
        log.warn("订单约束违反异常: {}", errorMsg.toString());
        return R.failed(errorMsg.toString());
    }

    /**
     * 处理重复键异常
     */
    @ExceptionHandler(DuplicateKeyException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public R<String> handleDuplicateKeyException(DuplicateKeyException e) {
        log.error("订单数据重复异常: {}", e.getMessage(), e);
        return R.failed("数据重复，请检查订单号或幂等性键是否已存在");
    }

    /**
     * 处理数据完整性违反异常
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public R<String> handleDataIntegrityViolationException(DataIntegrityViolationException e) {
        log.error("订单数据完整性违反异常: {}", e.getMessage(), e);
        return R.failed("数据完整性违反，请检查关联数据是否存在");
    }

    /**
     * 处理SQL异常
     */
    @ExceptionHandler(SQLException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public R<String> handleSQLException(SQLException e) {
        log.error("订单SQL异常: {}", e.getMessage(), e);
        return R.failed("数据库操作异常，请稍后重试");
    }

    /**
     * 处理空指针异常
     */
    @ExceptionHandler(NullPointerException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public R<String> handleNullPointerException(NullPointerException e) {
        log.error("订单空指针异常: {}", e.getMessage(), e);
        return R.failed("系统内部错误，请联系管理员");
    }

    /**
     * 处理其他运行时异常
     */
    @ExceptionHandler(RuntimeException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public R<String> handleRuntimeException(RuntimeException e) {
        log.error("订单运行时异常: {}", e.getMessage(), e);
        return R.failed("系统异常: " + e.getMessage());
    }

    /**
     * 处理其他异常
     */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public R<String> handleException(Exception e) {
        log.error("订单未知异常: {}", e.getMessage(), e);
        return R.failed("系统异常，请稍后重试");
    }
}
package com.cloudflow.common.statemachine.exception;

import com.cloudflow.common.core.domain.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 状态机异常处理器。拦截 IllegalStateTransitionException，翻译成 HTTP 409 Conflict。
 * 优先级高于 GlobalExceptionHandler，避免被通用 ServiceException 分支吞掉。
 */
@RestControllerAdvice
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class StateMachineExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(StateMachineExceptionHandler.class);

    @ExceptionHandler(IllegalStateTransitionException.class)
    public ResponseEntity<R<?>> handleIllegalStateTransition(IllegalStateTransitionException ex) {
        log.warn("非法状态流转: entity={}, from={}, event={}",
                ex.getEntity(), ex.getFromState(), ex.getEvent());
        R<?> body = R.fail(HttpStatus.CONFLICT.value(), ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }
}

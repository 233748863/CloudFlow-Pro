package com.cloudflow.common.statemachine.exception;

import com.cloudflow.common.core.exception.ServiceException;

/**
 * 非法状态流转异常。业务侧统一抛出，由 StateMachineExceptionHandler 翻译成 HTTP 409。
 *
 * <p>code = 409，msg 形如：「报销单 [DRAFT] 不允许执行 [APPROVE] 事件」。
 */
public class IllegalStateTransitionException extends ServiceException {

    private static final long serialVersionUID = 1L;

    /** HTTP 409 Conflict，与 GlobalExceptionHandler 的 resolveHttpStatus 对齐。 */
    public static final int CODE = 409;

    private final String entity;
    private final String fromState;
    private final String event;

    public IllegalStateTransitionException(String entity, String fromState, String event) {
        super(buildMessage(entity, fromState, event), CODE);
        this.entity = entity;
        this.fromState = fromState;
        this.event = event;
    }

    public String getEntity() {
        return entity;
    }

    public String getFromState() {
        return fromState;
    }

    public String getEvent() {
        return event;
    }

    private static String buildMessage(String entity, String fromState, String event) {
        return entity + " [" + fromState + "] 不允许执行 [" + event + "] 事件";
    }
}

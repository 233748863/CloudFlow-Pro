package com.cloudflow.oa.enums;

import com.cloudflow.common.statemachine.core.StateEvent;

/**
 * 出差申请事件枚举
 * M1-6: 状态机迁移
 */
public enum BusinessTripEvent implements StateEvent {
    /** 提交审批 */
    SUBMIT,
    /** 审批通过 */
    APPROVE,
    /** 驳回 */
    REJECT,
    /** 取消 */
    CANCEL
}

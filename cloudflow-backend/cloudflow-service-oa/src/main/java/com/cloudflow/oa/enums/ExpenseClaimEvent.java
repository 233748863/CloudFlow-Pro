package com.cloudflow.oa.enums;

import com.cloudflow.common.statemachine.core.StateEvent;

/**
 * 报销申请事件枚举
 * M1-6: 状态机迁移
 */
public enum ExpenseClaimEvent implements StateEvent {
    /** 提交审批 */
    SUBMIT,
    /** 审批通过 */
    APPROVE,
    /** 驳回 */
    REJECT,
    /** 确认支付 */
    PAY,
    /** 取消 */
    CANCEL
}

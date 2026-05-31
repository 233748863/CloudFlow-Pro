package com.cloudflow.hr.enums;

import com.cloudflow.common.statemachine.core.StateEvent;

/**
 * 福利申请事件枚举
 * M1-6: 状态机迁移
 */
public enum BenefitRequestEvent implements StateEvent {
    /** 提交审批 */
    SUBMIT,
    /** 审批通过 */
    APPROVE,
    /** 驳回 */
    REJECT,
    /** 发放 */
    PAY,
    /** 取消 */
    CANCEL
}

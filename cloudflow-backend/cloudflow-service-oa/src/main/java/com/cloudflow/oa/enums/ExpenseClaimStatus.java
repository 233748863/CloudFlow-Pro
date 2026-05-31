package com.cloudflow.oa.enums;

import com.cloudflow.common.statemachine.annotation.DictBound;
import com.cloudflow.common.statemachine.core.StateValue;

/**
 * 报销申请状态枚举
 * M1-6: 状态机迁移
 */
@DictBound("expense_claim_status")
public enum ExpenseClaimStatus implements StateValue {
    /** 草稿 */
    DRAFT,
    /** 审批中 */
    PENDING,
    /** 已审批 */
    APPROVED,
    /** 已驳回 */
    REJECTED,
    /** 已支付 */
    PAID,
    /** 已取消 */
    CANCELLED
}

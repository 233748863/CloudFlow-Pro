package com.cloudflow.hr.enums;

import com.cloudflow.common.statemachine.annotation.DictBound;
import com.cloudflow.common.statemachine.core.StateValue;

/**
 * 福利申请状态枚举
 * M1-6: 状态机迁移
 */
@DictBound("benefit_request_status")
public enum BenefitRequestStatus implements StateValue {
    /** 草稿 */
    DRAFT,
    /** 审批中 */
    APPROVING,
    /** 已审批 */
    APPROVED,
    /** 已驳回 */
    REJECTED,
    /** 已发放 */
    PAID,
    /** 已取消 */
    CANCELLED
}

package com.cloudflow.oa.enums;

import com.cloudflow.common.statemachine.annotation.DictBound;
import com.cloudflow.common.statemachine.core.StateValue;

/**
 * 出差申请状态枚举
 * M1-6: 状态机迁移
 */
@DictBound("business_trip_status")
public enum BusinessTripStatus implements StateValue {
    /** 草稿 */
    DRAFT,
    /** 审批中 */
    PENDING,
    /** 已审批 */
    APPROVED,
    /** 已驳回 */
    REJECTED,
    /** 已取消 */
    CANCELLED
}

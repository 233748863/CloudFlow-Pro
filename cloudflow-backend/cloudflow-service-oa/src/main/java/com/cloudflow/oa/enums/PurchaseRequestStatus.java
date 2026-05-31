package com.cloudflow.oa.enums;

import com.cloudflow.common.statemachine.annotation.DictBound;
import com.cloudflow.common.statemachine.core.StateValue;

/**
 * 采购申请状态枚举
 * M1-6: 状态机迁移
 */
@DictBound("purchase_request_status")
public enum PurchaseRequestStatus implements StateValue {
    /** 草稿 */
    DRAFT,
    /** 审批中 */
    PENDING,
    /** 已审批 */
    APPROVED,
    /** 已驳回 */
    REJECTED,
    /** 部分入库 */
    PARTIAL_RECEIVED,
    /** 已入库 */
    RECEIVED,
    /** 已取消 */
    CANCELLED
}

package com.cloudflow.oa.enums;

import com.cloudflow.common.statemachine.core.StateEvent;

/**
 * 采购申请事件枚举
 * M1-6: 状态机迁移
 */
public enum PurchaseRequestEvent implements StateEvent {
    /** 提交审批 */
    SUBMIT,
    /** 审批通过 */
    APPROVE,
    /** 驳回 */
    REJECT,
    /** 部分入库 */
    PARTIAL_RECEIVE,
    /** 完全入库 */
    FULL_RECEIVE,
    /** 取消 */
    CANCEL
}

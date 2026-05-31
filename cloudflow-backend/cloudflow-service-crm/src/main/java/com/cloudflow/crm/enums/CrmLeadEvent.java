package com.cloudflow.crm.enums;

import com.cloudflow.common.statemachine.core.StateEvent;

/**
 * CRM 线索事件枚举
 * M1-6: 状态机迁移
 */
public enum CrmLeadEvent implements StateEvent {
    /** 联系 */
    CONTACT,
    /** 确认 */
    QUALIFY,
    /** 转化为客户 */
    CONVERT,
    /** 标记无效 */
    INVALIDATE
}

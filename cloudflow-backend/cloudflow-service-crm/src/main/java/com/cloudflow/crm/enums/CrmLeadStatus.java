package com.cloudflow.crm.enums;

import com.cloudflow.common.statemachine.annotation.DictBound;
import com.cloudflow.common.statemachine.core.StateValue;

/**
 * CRM 线索状态枚举
 * M1-6: 状态机迁移
 */
@DictBound("crm_lead_status")
public enum CrmLeadStatus implements StateValue {
    /** 新建 */
    NEW,
    /** 已联系 */
    CONTACTED,
    /** 已确认 */
    QUALIFIED,
    /** 已转化 */
    CONVERTED,
    /** 无效 */
    INVALID
}

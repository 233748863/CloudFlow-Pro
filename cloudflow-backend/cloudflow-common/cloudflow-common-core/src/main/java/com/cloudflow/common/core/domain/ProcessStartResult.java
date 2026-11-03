package com.cloudflow.common.core.domain;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/** 流程启动结果：实例编号与独立业务单号。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProcessStartResult implements Serializable {
    private static final long serialVersionUID = 1L;

    private String instanceId;
    private String processNo;

    /** 校验成功响应中的实例编号，供调用方在绑定业务单据前使用。 */
    public String requireInstanceId() {
        if (instanceId == null || instanceId.isBlank() || instanceId.length() > 64
                || instanceId.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalStateException("流程启动结果缺少有效实例编号");
        }
        return instanceId;
    }
}

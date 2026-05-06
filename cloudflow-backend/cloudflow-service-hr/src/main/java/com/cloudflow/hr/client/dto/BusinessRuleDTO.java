package com.cloudflow.hr.client.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 远程业务规则 DTO。
 */
@Data
public class BusinessRuleDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String ruleCode;
    private String ruleName;
    private String module;
    private BigDecimal thresholdValue;
    private String effect;
    private Integer enabled;
    private Integer priority;
    private String remark;
}

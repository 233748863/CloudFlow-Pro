package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 业务规则命中记录。
 */
@Data
public class BusinessRuleHitRecordDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private String ruleCode;
    private String businessType;
    private Long businessId;
    private BigDecimal thresholdValue;
    private BigDecimal actualValue;
    private String effect;
    private String hitResult;
}

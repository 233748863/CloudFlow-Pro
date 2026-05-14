package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class HrPerformanceAssignmentChildPayload {

    private String assigneeType;
    private Long assigneeId;
    private String assigneeName;
    private BigDecimal targetAmount;
    private BigDecimal metricWeight;
    private BigDecimal weight;
    private String categoryCode;
    private String categoryName;
    private String metricCode;
    private String metricName;
    private String metricUnit;
    private String quotaSource;
    private String metricValueType;
    private String valueType;
    private Integer metricPrecision;
    private Integer precision;
    private Boolean locked;
}

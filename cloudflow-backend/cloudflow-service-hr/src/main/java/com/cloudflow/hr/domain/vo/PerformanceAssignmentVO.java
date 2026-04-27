package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class PerformanceAssignmentVO {

    private Long id;

    private Long objectiveId;

    private Long parentId;

    private String nodeKey;

    private String assigneeType;

    private Long assigneeId;

    private String assigneeName;

    private String categoryCode;

    private String categoryName;

    private String metricCode;

    private String metricName;

    private String metricUnit;

    private String metricValueType;

    private Integer metricPrecision;

    private BigDecimal metricWeight;

    private BigDecimal targetAmount;

    private BigDecimal actualAmount;

    private BigDecimal completionRate;

    private BigDecimal cappedRate;

    private BigDecimal score;

    private String grade;

    private String quotaSource;

    private Boolean locked;

    private Long ownerEmployeeId;

    private Integer sortOrder;

    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private List<PerformanceAssignmentVO> children = new ArrayList<>();
}

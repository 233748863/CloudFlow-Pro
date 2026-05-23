package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * HR-P0-2 绩效强制分布规则 payload。
 */
@Data
public class HrPerfDistributionRulePayload {

    private Long id;
    private Long objectiveId;
    private String ruleName;
    /** 分布配额配置 [{grade:"S",percent:10,minCount:0,maxCount:99}] */
    private List<Map<String, Object>> distribution;
    private Integer totalPopulation;
    /** BLOCK / WARN */
    private String enforceMode;
    /** ACTIVE / INACTIVE */
    private String status;
    private String remark;
}

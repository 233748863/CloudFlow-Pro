package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * OA 风险统计。
 */
@Data
public class OaRiskStatsDTO {
    private long openCount;
    private long handlingCount;
    private long closedCount;
    private long ignoredCount;
    private long highRiskCount;
    private long manualCount;
    private long ruleCount;
    private long contractUnsealedCount;
    private long overdueReturnCount;
    private long unarchivedCount;
}

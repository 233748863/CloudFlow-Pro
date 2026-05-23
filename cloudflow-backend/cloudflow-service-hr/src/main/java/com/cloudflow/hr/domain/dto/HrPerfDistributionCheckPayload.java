package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * HR-P0-2 强制分布校验入参：基于评分明细 + 目标规则做配额校验。
 */
@Data
public class HrPerfDistributionCheckPayload {

    private Long objectiveId;
    /** 评分明细 [{employeeId, employeeName, grade}] - 若 grade 缺省按 score 推导 */
    private List<Map<String, Object>> grades;
}

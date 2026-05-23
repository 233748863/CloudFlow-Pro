package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * HR-P0-1 360 评估人提交打分 payload。
 */
@Data
public class Hr360EvaluatorResponsePayload {

    private Long evaluatorId;
    private BigDecimal score;
    /** 各维度细分打分 [{dimension,score,weight}] */
    private List<Map<String, Object>> dimensionScores;
    private String commentText;
}

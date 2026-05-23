package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.util.List;

/**
 * HR-P0-1 360 评估邀请发起 payload。
 * 一次邀请围绕一个绩效目标 + 被评员工，附若干评估人(可来自不同评估源)。
 */
@Data
public class Hr360EvaluatorInvitePayload {

    private Long objectiveId;
    private Long assignmentId;
    private Long evaluateeId;
    private String evaluateeName;
    private List<Item> evaluators;

    @Data
    public static class Item {
        private Long evaluatorId;
        private String evaluatorName;
        /** SELF / MANAGER / PEER / SUBORDINATE / CUSTOMER */
        private String evaluatorSource;
        /** 该评估源权重 (%) */
        private java.math.BigDecimal weight;
    }
}

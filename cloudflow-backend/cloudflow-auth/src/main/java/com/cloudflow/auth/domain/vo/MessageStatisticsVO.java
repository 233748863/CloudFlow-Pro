package com.cloudflow.auth.domain.vo;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 消息统计。
 */
@Data
public class MessageStatisticsVO {
    private long total;
    private long success;
    private long failed;
    private long unknown;
    private double successRate;
    private List<FailureReasonVO> topFailureReasons;
    private Map<String, Double> channelSuccessRates;
    private Map<String, Double> templateSuccessRates;

    @Data
    public static class FailureReasonVO {
        private String reason;
        private long count;
    }
}

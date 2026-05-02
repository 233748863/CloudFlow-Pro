package com.cloudflow.workflow.domain.monitor;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 超时告警处理结果。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TimeoutAlertHandleResult {
    private Long alertId;
    private String action;
    private Long escalatedToId;
    private String escalatedToName;
    private String escalatedTime;
    private String message;
}

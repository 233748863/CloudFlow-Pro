package com.cloudflow.common.job.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Handler 执行结果。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobResult {
    private String executeStatus;
    private Integer affectedRows;
    private String resultMsg;
    private String exceptionStack;
    private Long durationMs;

    public static JobResult success(Integer affectedRows, String resultMsg) {
        return builder().executeStatus("SUCCESS").affectedRows(affectedRows).resultMsg(resultMsg).build();
    }

    public static JobResult failed(String message) {
        return builder().executeStatus("FAILED").resultMsg(message).exceptionStack(message).build();
    }
}

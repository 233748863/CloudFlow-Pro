package com.cloudflow.common.job.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 执行状态反查结果。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class JobStatusVO {
    private String executeNo;
    private String executeStatus;
    private Integer affectedRows;
    private String resultMsg;
    private String exceptionStack;
    private Long durationMs;
}

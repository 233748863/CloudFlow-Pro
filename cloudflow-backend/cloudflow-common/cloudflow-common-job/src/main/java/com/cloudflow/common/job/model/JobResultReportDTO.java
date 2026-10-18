package com.cloudflow.common.job.model;

import lombok.Data;

/**
 * 业务服务回报执行结果。
 */
@Data
public class JobResultReportDTO {
    private String executeNo;
    private String executeStatus;
    private Integer affectedRows;
    private String resultMsg;
    private String exceptionStack;
    private String executorIp;
    private Long durationMs;
}

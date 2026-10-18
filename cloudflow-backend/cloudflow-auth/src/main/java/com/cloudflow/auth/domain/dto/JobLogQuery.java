package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 任务日志查询条件。
 */
@Data
public class JobLogQuery {
    private Long jobId;
    private String handlerName;
    private String executeStatus;
    private String beginTime;
    private String endTime;
}

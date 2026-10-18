package com.cloudflow.common.job.model;

import lombok.Data;

/**
 * auth 调用业务服务的执行请求。
 */
@Data
public class JobExecuteDTO {
    private Long jobId;
    private Long jobLogId;
    private String executeNo;
    private String handlerName;
    private String handlerParam;
    private Integer timeoutSeconds;
    private Integer lockTimeSeconds;
    private Integer concurrentFlag;
}

package com.cloudflow.common.job.model;

import lombok.Data;

import java.util.List;

/**
 * Handler 启动上报请求。
 */
@Data
public class HandlerReportDTO {
    private String serviceName;
    private List<HandlerInfo> handlers;
}

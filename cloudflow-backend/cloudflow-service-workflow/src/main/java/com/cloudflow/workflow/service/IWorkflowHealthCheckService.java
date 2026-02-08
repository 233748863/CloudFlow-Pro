package com.cloudflow.workflow.service;

import java.util.Map;

/**
 * 流程引擎健康检查服务接口
 */
public interface IWorkflowHealthCheckService {

    /** 执行全面健康检查 */
    Map<String, Object> performHealthCheck();
}

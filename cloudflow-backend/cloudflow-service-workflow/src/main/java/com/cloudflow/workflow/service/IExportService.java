package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;

import java.util.List;

/**
 * 流程导出服务接口
 * 提供单个和批量流程导出功能
 * 
 * @author CloudFlow
 */
public interface IExportService {

    /**
     * 导出单个流程
     * 
     * @param workflowId 流程 ID
     * @param includeSensitive 是否包含敏感配置（如密码、密钥等）
     * @return 导出格式对象
     */
    WorkflowExportFormat exportWorkflow(String workflowId, boolean includeSensitive);

    /**
     * 批量导出流程（管理员权限）
     * 
     * @param workflowIds 流程 ID 列表
     * @param includeSensitive 是否包含敏感配置
     * @return 导出格式对象列表
     */
    List<WorkflowExportFormat> exportWorkflows(List<String> workflowIds, boolean includeSensitive);

    /**
     * 生成导出文件名
     * 格式：workflow_流程名称_版本号_日期.json
     * 
     * @param workflowName 流程名称
     * @param version 版本号
     * @return 文件名
     */
    String generateExportFileName(String workflowName, String version);

    /**
     * 生成批量导出文件名
     * 格式：workflows_batch_日期.json
     * 
     * @return 文件名
     */
    String generateBatchExportFileName();
}

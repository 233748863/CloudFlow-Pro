package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.ImportResultDTO;
import com.cloudflow.workflow.domain.dto.WorkflowExportFormat;
import com.cloudflow.workflow.resolver.ConflictResolver.ConflictStrategy;

import java.util.List;

/**
 * 流程导入服务接口
 * 
 * @author CloudFlow
 */
public interface IImportService {

    /**
     * 导入单个流程
     * 
     * @param exportFormat 导出格式对象
     * @param strategy 冲突解决策略
     * @return 导入结果
     */
    ImportResultDTO importWorkflow(WorkflowExportFormat exportFormat, ConflictStrategy strategy);

    /**
     * 批量导入流程
     * 
     * @param exportFormats 导出格式对象列表
     * @param strategy 冲突解决策略
     * @return 导入结果列表
     */
    List<ImportResultDTO> importWorkflows(List<WorkflowExportFormat> exportFormats, ConflictStrategy strategy);
}

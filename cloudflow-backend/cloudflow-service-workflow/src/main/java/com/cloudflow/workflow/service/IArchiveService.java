package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.WfProcessArchive;
import com.cloudflow.workflow.domain.dto.ArchivedWorkflowDTO;
import com.cloudflow.workflow.domain.dto.BatchOperationResultDTO;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 流程归档服务接口
 * 提供流程归档、恢复和永久删除功能
 * 
 * @author CloudFlow
 */
public interface IArchiveService {

    /**
     * 归档单个流程
     * 
     * @param workflowId 流程 ID
     * @param reason 归档原因
     * @return 操作结果
     */
    BatchOperationResultDTO archiveWorkflow(String workflowId, String reason);

    /**
     * 批量归档流程
     * 
     * @param workflowIds 流程 ID 列表
     * @param reason 归档原因
     * @return 批量操作结果
     */
    BatchOperationResultDTO archiveWorkflows(List<String> workflowIds, String reason);

    /**
     * 恢复归档流程
     * 
     * @param workflowId 流程 ID
     * @return 操作结果
     */
    BatchOperationResultDTO restoreWorkflow(String workflowId);

    /**
     * 批量恢复归档流程
     * 
     * @param workflowIds 流程 ID 列表
     * @return 批量操作结果
     */
    BatchOperationResultDTO restoreWorkflows(List<String> workflowIds);

    /**
     * 查询归档流程列表（分页）
     * 
     * @param keyword 关键词（流程名称或归档原因）
     * @param archivedAfter 归档时间起始
     * @param archivedBefore 归档时间结束
     * @param pageNum 页码
     * @param pageSize 每页大小
     * @return 归档流程分页列表
     */
    Page<ArchivedWorkflowDTO> listArchivedWorkflows(
        String keyword,
        LocalDateTime archivedAfter,
        LocalDateTime archivedBefore,
        int pageNum,
        int pageSize
    );

    /**
     * 永久删除流程
     * 
     * @param workflowId 流程 ID
     * @return 操作结果
     */
    BatchOperationResultDTO permanentDeleteWorkflow(String workflowId);

    /**
     * 批量永久删除流程
     * 
     * @param workflowIds 流程 ID 列表
     * @return 批量操作结果
     */
    BatchOperationResultDTO permanentDeleteWorkflows(List<String> workflowIds);
}

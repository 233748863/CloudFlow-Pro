package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.VersionDTO;
import com.cloudflow.workflow.domain.dto.VersionDetailDTO;

import java.util.List;

/**
 * 流程版本服务接口
 * 提供版本管理的核心功能
 * 
 * @author CloudFlow
 */
public interface IVersionService {

    /**
     * 创建新版本
     * 在流程保存时自动调用，记录流程的历史版本
     * 
     * @param workflowId 流程ID
     * @param definition 流程定义（JSON字符串）
     * @param changeLog 变更说明
     * @param createdBy 创建者ID
     * @return 创建的版本对象
     */
    WorkflowVersion createVersion(String workflowId, String definition, String changeLog, String createdBy);

    /**
     * 获取流程的版本历史列表
     * 按创建时间倒序排列
     * 
     * @param workflowId 流程ID
     * @return 版本列表
     */
    List<VersionDTO> getVersionHistory(String workflowId);

    /**
     * 获取特定版本的详细信息
     * 包含完整的流程定义
     * 
     * @param versionId 版本ID
     * @return 版本详情
     */
    VersionDetailDTO getVersionDetail(String versionId);

    /**
     * 获取流程的最新版本
     * 
     * @param workflowId 流程ID
     * @return 最新版本，如果不存在返回null
     */
    WorkflowVersion getLatestVersion(String workflowId);

    /**
     * 根据版本号获取版本
     * 
     * @param workflowId 流程ID
     * @param versionNumber 版本号
     * @return 版本对象，如果不存在返回null
     */
    WorkflowVersion getVersionByNumber(String workflowId, String versionNumber);

    /**
     * 回滚到指定版本
     * 恢复指定版本的流程定义，并创建新的回滚版本记录
     * 
     * @param workflowId 流程ID
     * @param targetVersionId 目标版本ID
     * @param reason 回滚原因
     * @param forceRollback 是否强制回滚（即使有运行中的实例）
     * @param operatorId 操作人ID
     * @return 回滚后的新版本
     */
    WorkflowVersion rollbackToVersion(String workflowId, String targetVersionId, String reason, 
                                     Boolean forceRollback, String operatorId);

    /**
     * 检查流程是否有正在运行的实例
     * 
     * @param workflowId 流程ID
     * @return 是否有运行中的实例
     */
    boolean hasRunningInstances(String workflowId);
}

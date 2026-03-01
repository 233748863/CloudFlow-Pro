package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 冲突解决结果 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConflictResolution {

    /**
     * 冲突解决策略
     * overwrite: 覆盖现有流程
     * rename: 重命名新流程
     * skip: 跳过导入
     */
    private String strategy;

    /**
     * 原始流程名称
     */
    private String originalName;

    /**
     * 新流程名称（重命名策略时使用）
     */
    private String newName;

    /**
     * 执行的操作
     * create: 创建新流程
     * update: 更新现有流程
     * skip: 跳过
     * error: 错误
     */
    private String action;

    /**
     * 现有流程 ID（覆盖策略时使用）
     */
    private String existingWorkflowId;

    /**
     * 结果消息
     */
    private String message;
}

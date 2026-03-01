package com.cloudflow.workflow.domain.dto;

import lombok.Builder;
import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 导入验证结果 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
public class ValidationResultDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    /**
     * 验证是否通过
     */
    private Boolean valid;

    /**
     * 流程名称
     */
    private String workflowName;

    /**
     * 流程版本
     */
    private String version;

    /**
     * 导出格式版本
     */
    private String exportFormatVersion;

    /**
     * 错误列表
     */
    private List<String> errors;

    /**
     * 警告列表
     */
    private List<String> warnings;

    /**
     * 不支持的节点类型列表
     */
    private List<String> unsupportedNodeTypes;

    /**
     * 不支持的集成列表
     */
    private List<String> unsupportedIntegrations;

    /**
     * 是否有名称冲突
     */
    private Boolean hasNameConflict;

    /**
     * 冲突的流程 ID（如果存在）
     */
    private String conflictingWorkflowId;

    /**
     * 校验和是否有效
     */
    private Boolean checksumValid;

    /**
     * 详细信息
     */
    private String details;
}

package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 流程导入结果 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportResultDTO {

    /**
     * 是否成功
     */
    private Boolean success;

    /**
     * 流程 ID（导入成功时）
     */
    private String workflowId;

    /**
     * 流程名称
     */
    private String workflowName;

    /**
     * 执行的操作
     * created: 创建新流程
     * updated: 更新现有流程
     * skipped: 跳过
     */
    private String action;

    /**
     * 错误信息列表
     */
    @Builder.Default
    private List<String> errors = new ArrayList<>();

    /**
     * 警告信息列表
     */
    @Builder.Default
    private List<String> warnings = new ArrayList<>();

    /**
     * 详细消息
     */
    private String message;

    /**
     * 创建成功结果
     */
    public static ImportResultDTO success(String workflowId, String workflowName, String action) {
        return ImportResultDTO.builder()
            .success(true)
            .workflowId(workflowId)
            .workflowName(workflowName)
            .action(action)
            .message("导入成功")
            .build();
    }

    /**
     * 创建失败结果
     */
    public static ImportResultDTO failure(String workflowName, String errorMessage) {
        ImportResultDTO result = ImportResultDTO.builder()
            .success(false)
            .workflowName(workflowName)
            .action("failed")
            .message("导入失败")
            .build();
        result.getErrors().add(errorMessage);
        return result;
    }

    /**
     * 创建跳过结果
     */
    public static ImportResultDTO skipped(String workflowName, String reason) {
        return ImportResultDTO.builder()
            .success(true)
            .workflowName(workflowName)
            .action("skipped")
            .message("已跳过: " + reason)
            .build();
    }
}

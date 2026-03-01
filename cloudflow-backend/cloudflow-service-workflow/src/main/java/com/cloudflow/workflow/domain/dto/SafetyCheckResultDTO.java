package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 安全检查结果 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SafetyCheckResultDTO {

    /**
     * 是否安全（可以执行操作）
     */
    private Boolean safe;

    /**
     * 警告信息列表
     */
    @Builder.Default
    private List<String> warnings = new ArrayList<>();

    /**
     * 错误信息列表
     */
    @Builder.Default
    private List<String> errors = new ArrayList<>();

    /**
     * 有正在运行实例的流程 ID 列表
     */
    @Builder.Default
    private List<String> workflowsWithRunningInstances = new ArrayList<>();

    /**
     * 有依赖关系的流程 ID 列表
     */
    @Builder.Default
    private List<String> workflowsWithDependencies = new ArrayList<>();

    /**
     * 无权限操作的流程 ID 列表
     */
    @Builder.Default
    private List<String> workflowsWithoutPermission = new ArrayList<>();

    /**
     * 详细信息（流程 ID -> 详细消息）
     */
    @Builder.Default
    private Map<String, String> details = new HashMap<>();

    /**
     * 总体消息
     */
    private String message;

    /**
     * 创建安全结果
     */
    public static SafetyCheckResultDTO safe() {
        return SafetyCheckResultDTO.builder()
            .safe(true)
            .message("安全检查通过，可以执行操作")
            .build();
    }

    /**
     * 创建不安全结果
     */
    public static SafetyCheckResultDTO unsafe(String message) {
        return SafetyCheckResultDTO.builder()
            .safe(false)
            .message(message)
            .build();
    }
}

package com.cloudflow.workflow.domain.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 审计日志 DTO
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLogDTO {

    /**
     * 审计日志 ID
     */
    private String id;

    /**
     * 操作类型
     */
    private String operationType;

    /**
     * 操作对象类型
     */
    private String targetType;

    /**
     * 操作对象 ID
     */
    private String targetId;

    /**
     * 操作对象名称
     */
    private String targetName;

    /**
     * 操作人 ID
     */
    private String operatorId;

    /**
     * 操作人名称
     */
    private String operatorName;

    /**
     * 操作时间
     */
    private LocalDateTime operationTime;

    /**
     * 操作原因/说明
     */
    private String operationReason;

    /**
     * 操作结果
     */
    private String operationResult;

    /**
     * 错误信息
     */
    private String errorMessage;

    /**
     * IP 地址
     */
    private String ipAddress;
}

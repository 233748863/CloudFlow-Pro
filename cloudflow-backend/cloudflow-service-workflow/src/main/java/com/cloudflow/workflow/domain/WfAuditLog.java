package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 审计日志实体
 * 记录系统中所有关键操作的审计信息
 * 
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("wf_audit_log")
public class WfAuditLog {

    /**
     * 审计日志 ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 操作类型
     * 如：TEMPLATE_CREATE, TEMPLATE_UPDATE, TEMPLATE_DELETE,
     *     VERSION_ROLLBACK, WORKFLOW_ARCHIVE, WORKFLOW_RESTORE, WORKFLOW_DELETE
     */
    @TableField("operation_type")
    private String operationType;

    /**
     * 操作对象类型
     * 如：TEMPLATE, WORKFLOW, VERSION
     */
    @TableField("target_type")
    private String targetType;

    /**
     * 操作对象 ID
     */
    @TableField("target_id")
    private String targetId;

    /**
     * 操作对象名称（冗余存储，便于查询）
     */
    @TableField("target_name")
    private String targetName;

    /**
     * 操作人 ID
     */
    @TableField("operator_id")
    private String operatorId;

    /**
     * 操作人名称（冗余存储）
     */
    @TableField("operator_name")
    private String operatorName;

    /**
     * 操作时间
     */
    @TableField("operation_time")
    private LocalDateTime operationTime;

    /**
     * 操作原因/说明
     */
    @TableField("operation_reason")
    private String operationReason;

    /**
     * 操作详情（JSON 格式，存储操作前后的数据变化）
     */
    @TableField("operation_details")
    private String operationDetails;

    /**
     * 操作结果
     * SUCCESS, FAILED
     */
    @TableField("operation_result")
    private String operationResult;

    /**
     * 错误信息（如果操作失败）
     */
    @TableField("error_message")
    private String errorMessage;

    /**
     * IP 地址
     */
    @TableField("ip_address")
    private String ipAddress;

    /**
     * 用户代理（浏览器信息）
     */
    @TableField("user_agent")
    private String userAgent;

    /**
     * 租户 ID
     */
    @TableField("tenant_id")
    private Long tenantId;
}

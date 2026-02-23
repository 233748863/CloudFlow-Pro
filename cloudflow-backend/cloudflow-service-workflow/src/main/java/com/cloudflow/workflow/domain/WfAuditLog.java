package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 工作流审计日志实体
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
@TableName("wf_audit_log")
public class WfAuditLog implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 日志ID
     */
    @TableId(type = IdType.AUTO)
    private Long logId;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 流程实例ID
     */
    private String instanceId;

    /**
     * 流程定义Key
     */
    private String processDefKey;

    /**
     * 任务ID
     */
    private String taskId;

    /**
     * 操作类型
     */
    private String action;

    /**
     * 操作描述
     */
    private String actionDesc;

    /**
     * 操作人ID
     */
    private Long userId;

    /**
     * 操作人姓名
     */
    private String userName;

    /**
     * 操作时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actionTime;

    /**
     * IP地址
     */
    private String ipAddress;

    /**
     * 用户代理
     */
    private String userAgent;

    /**
     * 操作结果：SUCCESS/FAILURE
     */
    private String result;

    /**
     * 错误信息
     */
    private String errorMessage;

    /**
     * 操作前数据（JSON）
     */
    private String beforeData;

    /**
     * 操作后数据（JSON）
     */
    private String afterData;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}

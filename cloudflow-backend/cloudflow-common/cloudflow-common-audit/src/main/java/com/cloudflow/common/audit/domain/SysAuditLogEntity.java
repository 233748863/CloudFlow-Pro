package com.cloudflow.common.audit.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 审计日志实体
 *
 * @author CloudFlow
 */
@Data
@TableName("sys_audit_log")
public class SysAuditLogEntity {

    /** 审计ID */
    @TableId(type = IdType.AUTO)
    private Long auditId;

    /** 租户ID */
    private Long tenantId;

    /** 审计业务名称 */
    private String auditName;

    /** 变更字段名 */
    private String auditField;

    /** 变更前值 */
    private String beforeVal;

    /** 变更后值 */
    private String afterVal;

    /** 变更前完整 JSON（M0-5：diff=true 时记录） */
    private String beforeJson;

    /** 变更后完整 JSON（M0-5：diff=true 时记录） */
    private String afterJson;

    /** JSON diff（M0-5：diff=true 时记录，Jackson JsonDiff 格式） */
    private String diffJson;

    /** 高风险标记 */
    private Integer highRisk;

    /** 风险等级 */
    private String riskLevel;

    /** 操作人 */
    private String createBy;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}

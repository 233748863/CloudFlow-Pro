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

    /** 操作人 */
    private String createBy;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}

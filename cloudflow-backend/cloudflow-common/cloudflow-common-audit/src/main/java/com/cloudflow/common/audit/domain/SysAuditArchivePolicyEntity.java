package com.cloudflow.common.audit.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Audit archive policy.
 */
@Data
@TableName("sys_audit_archive_policy")
public class SysAuditArchivePolicyEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String bizModule;

    private Integer retainDays;

    private String archiveTable;

    private String status;

    private String createBy;

    private LocalDateTime createTime;

    private String updateBy;

    private LocalDateTime updateTime;
}

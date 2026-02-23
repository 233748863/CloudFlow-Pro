package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * P4.22: 发布记录（已扩展支持回滚、审批、窗口）
 */
@Data
@TableName("wf_deploy_record")
public class WfDeployRecord {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 流程定义ID */
    private String processDefId;
    
    /** 流程Key */
    private String processKey;
    
    /** 版本号 */
    private Integer version;
    
    /** 发布状态 */
    private String deployStatus;
    
    /** 发布人ID */
    private Long deployBy;
    
    /** 发布人姓名 */
    private String deployerName;
    
    /** 发布时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime deployTime;
    
    /** 发布说明 */
    private String deployNote;
    
    /** 变更日志 */
    private String changeLog;

    // ========== P4 兼容方法 ==========

    /** Alias: definitionId -> processDefId */
    public String getDefinitionId() { return processDefId; }
    public void setDefinitionId(String definitionId) { this.processDefId = definitionId; }

    /** Alias: deployerId -> deployBy */
    public Long getDeployerId() { return deployBy; }
    public void setDeployerId(Long deployerId) { this.deployBy = deployerId; }
    
    // ========== P2增强字段 ==========
    
    /** 是否可回滚 */
    private Boolean canRollback;
    
    /** 回滚自哪个版本 */
    private Integer rollbackFromVersion;
    
    /** 回滚原因 */
    private String rollbackReason;
    
    /** 回滚操作人ID */
    private Long rollbackBy;
    
    /** 回滚时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime rollbackTime;
    
    /** 关联的审批ID */
    private Long approvalId;
    
    /** 关联的发布窗口ID */
    private Long deployWindowId;
    
    /** 影响分析(JSON格式) */
    private String impactAnalysis;
    
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;
    
    @TableField(fill = FieldFill.UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updatedTime;
}

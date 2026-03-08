package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 流程版本快照实体（用于回滚）
 */
@Data
@TableName("wf_process_version_snapshot")
public class WfProcessVersionSnapshot {

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

    /** 发布记录ID */
    @TableField(exist = false)
    private Long deployId;

    /** 快照数据(完整的流程定义JSON) */
    private String snapshotData;

    /** BPMN XML内容 */
    private String bpmnXml;

    /** 表单配置 */
    private String formConfig;

    /** 节点配置 */
    private String nodeConfig;

    /** 创建人ID */
    @TableField(exist = false)
    private Long createdBy;

    @TableField(value = "create_time", fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;
}

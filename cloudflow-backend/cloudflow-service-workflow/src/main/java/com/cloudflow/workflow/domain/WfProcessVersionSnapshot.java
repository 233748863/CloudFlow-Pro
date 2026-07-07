package com.cloudflow.workflow.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 流程版本快照视图对象（C6: 版本体系统一后不再映射独立快照表，
 * 版本事实源为 wf_process_definition 多版本行，本类仅作为发布增强 API 兼容的值对象；
 * processDefId 为对应版本行的 definitionId，snapshotData 即该行 modelJson）
 */
@Data
public class WfProcessVersionSnapshot {

    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 流程定义ID（版本行 definitionId） */
    private String processDefId;

    /** 流程Key */
    private String processKey;

    /** 版本号 */
    private Integer version;

    /** 发布记录ID */
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
    private Long createdBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdTime;
}

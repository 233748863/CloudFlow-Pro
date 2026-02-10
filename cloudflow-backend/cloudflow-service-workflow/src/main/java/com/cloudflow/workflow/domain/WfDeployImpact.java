package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 发布影响分析实体
 */
@Data
@TableName("wf_deploy_impact")
public class WfDeployImpact {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 发布记录ID */
    private Long deployId;

    /** 影响类型: RUNNING_INSTANCE-运行中实例, PENDING_TASK-待办任务, FORM_CHANGE-表单变更, NODE_CHANGE-节点变更 */
    private String impactType;

    /** 影响级别: LOW-低, MEDIUM-中, HIGH-高, CRITICAL-严重 */
    private String impactLevel;

    /** 影响数量 */
    private Integer impactCount;

    /** 影响详情(JSON格式) */
    private String impactDetail;

    /** 处理建议 */
    private String suggestion;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
}

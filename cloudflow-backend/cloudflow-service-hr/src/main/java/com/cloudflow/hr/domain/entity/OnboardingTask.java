package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 入职任务实体类
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_onboarding_task")
public class OnboardingTask implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 入职申请ID
     */
    private Long applicationId;

    /**
     * 任务名称
     */
    private String taskName;

    /**
     * 任务类型：DOCUMENT-资料收集 ACCOUNT-账号开通 EQUIPMENT-设备领用 TRAINING-培训
     */
    private String taskType;

    /**
     * 任务描述
     */
    private String taskDescription;

    /**
     * 负责人ID
     */
    private Long assigneeId;

    /**
     * 状态：PENDING-待处理 IN_PROGRESS-处理中 COMPLETED-已完成
     */
    private String status;

    /**
     * 完成时间
     */
    private LocalDateTime completedTime;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Integer deleted;
}

package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 入职任务VO
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class OnboardingTaskVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键ID
     */
    private Long id;

    /**
     * 入职申请ID
     */
    private Long applicationId;

    /**
     * 任务名称
     */
    private String taskName;

    /**
     * 任务类型
     */
    private String taskType;

    /**
     * 任务类型描述
     */
    private String taskTypeDesc;

    /**
     * 任务描述
     */
    private String taskDescription;

    /**
     * 负责人ID
     */
    private Long assigneeId;

    /**
     * 负责人姓名
     */
    private String assigneeName;

    /**
     * 状态
     */
    private String status;

    /**
     * 状态描述
     */
    private String statusDesc;

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
    private LocalDateTime createTime;
}

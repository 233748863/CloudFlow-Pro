package com.cloudflow.workflow.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * 任务详情VO
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
public class TaskDetailVO {

    /**
     * 任务ID
     */
    private String taskId;

    /**
     * 任务名称
     */
    private String taskName;

    /**
     * 流程实例ID
     */
    private String instanceId;

    /**
     * 流程定义Key
     */
    private String processDefKey;

    /**
     * 流程定义名称
     */
    private String processDefName;

    /**
     * 处理人ID
     */
    private Long assigneeId;

    /**
     * 处理人姓名
     */
    private String assigneeName;

    /**
     * 候选人列表
     */
    private List<UserBriefVO> candidates;

    /**
     * 候选人ID列表
     */
    private List<Long> candidateUserIds;

    /**
     * 创建时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /**
     * 到期时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime dueDate;

    /**
     * 优先级
     */
    private Integer priority;

    /**
     * 任务状态
     */
    private String status;
}

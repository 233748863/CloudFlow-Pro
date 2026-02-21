package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 任务执行监控实体
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
@TableName("wf_task_monitor")
public class TaskMonitor {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID
     */
    private Long tenantId;

    /**
     * 任务ID
     */
    private String taskId;

    /**
     * 流程实例ID
     */
    private String instanceId;

    /**
     * 节点Key
     */
    private String nodeKey;

    /**
     * 任务名称
     */
    private String taskName;

    /**
     * 处理人ID
     */
    private Long assigneeId;

    /**
     * 处理人姓名
     */
    private String assigneeName;

    /**
     * 任务创建时间
     */
    @TableField("create_time_task")
    private LocalDateTime createTimeTask;

    /**
     * 认领时间
     */
    private LocalDateTime claimTime;

    /**
     * 完成时间
     */
    private LocalDateTime completeTime;

    /**
     * 等待时长(毫秒)
     */
    private Long waitDuration;

    /**
     * 处理时长(毫秒)
     */
    private Long handleDuration;

    /**
     * 总时长(毫秒)
     */
    private Long totalDuration;

    /**
     * 状态：PENDING/CLAIMED/COMPLETED/TIMEOUT
     */
    private String status;

    /**
     * 操作：APPROVE/REJECT/TRANSFER/DELEGATE
     */
    private String action;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

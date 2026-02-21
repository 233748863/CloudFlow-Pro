package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 流程执行监控实体
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
@TableName("wf_process_monitor")
public class ProcessMonitor {

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
     * 流程实例ID
     */
    private String instanceId;

    /**
     * 流程定义ID
     */
    private String processDefId;

    /**
     * 流程定义Key
     */
    private String processDefKey;

    /**
     * 流程定义名称
     */
    private String processDefName;

    /**
     * 业务键
     */
    private String businessKey;

    /**
     * 开始时间
     */
    private LocalDateTime startTime;

    /**
     * 结束时间
     */
    private LocalDateTime endTime;

    /**
     * 执行时长(毫秒)
     */
    private Long duration;

    /**
     * 状态：RUNNING/COMPLETED/FAILED/TERMINATED
     */
    private String status;

    /**
     * 已执行节点数量
     */
    private Integer nodeCount;

    /**
     * 已完成任务数量
     */
    private Integer taskCount;

    /**
     * 错误信息
     */
    private String errorMessage;

    /**
     * 发起人ID
     */
    private Long startUserId;

    /**
     * 发起人姓名
     */
    private String startUserName;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

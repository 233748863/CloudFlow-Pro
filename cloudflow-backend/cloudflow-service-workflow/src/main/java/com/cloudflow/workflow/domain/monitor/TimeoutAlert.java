package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 超时告警记录实体
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
@TableName("wf_timeout_alert")
public class TimeoutAlert {

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
     * 告警类型：TASK/PROCESS
     */
    private String alertType;

    /**
     * 目标ID（任务ID或流程实例ID）
     */
    private String targetId;

    /**
     * 目标名称
     */
    private String targetName;

    /**
     * 超时级别：REMIND/WARNING/CRITICAL
     */
    private String timeoutLevel;

    /**
     * 超时时长(毫秒)
     */
    private Long timeoutDuration;

    /**
     * 阈值(毫秒)
     */
    private Long threshold;

    /**
     * 处理人ID
     */
    private Long assigneeId;

    /**
     * 处理人姓名
     */
    private String assigneeName;

    /**
     * 告警时间
     */
    private LocalDateTime alertTime;

    /**
     * 是否已发送通知（Y是 N否）
     */
    private String notificationSent;

    /**
     * 是否已升级（Y是 N否）
     */
    private String escalated;

    /**
     * 是否已解决（Y是 N否）
     */
    private String resolved;

    /**
     * 解决时间
     */
    private LocalDateTime resolveTime;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 超时级别枚举
     */
    public enum TimeoutLevel {
        REMIND,    // 提醒
        WARNING,   // 警告
        CRITICAL   // 严重
    }

    /**
     * 告警类型枚举
     */
    public enum AlertType {
        TASK,      // 任务超时
        PROCESS    // 流程超时
    }
}

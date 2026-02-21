package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 异常流程记录实体
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
@TableName("wf_anomaly_alert")
public class AnomalyAlert {

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
     * 异常类型
     */
    private String anomalyType;

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
     * 节点Key
     */
    private String nodeKey;

    /**
     * 节点名称
     */
    private String nodeName;

    /**
     * 任务ID
     */
    private String taskId;

    /**
     * 错误信息
     */
    private String errorMessage;

    /**
     * 堆栈跟踪
     */
    private String stackTrace;

    /**
     * 严重程度：LOW/MEDIUM/HIGH/CRITICAL
     */
    private String severity;

    /**
     * 告警时间
     */
    private LocalDateTime alertTime;

    /**
     * 是否已发送通知（Y是 N否）
     */
    private String notificationSent;

    /**
     * 是否已解决（Y是 N否）
     */
    private String resolved;

    /**
     * 解决时间
     */
    private LocalDateTime resolveTime;

    /**
     * 解决说明
     */
    private String resolveNote;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 异常类型枚举
     */
    public enum AnomalyType {
        EXECUTION_FAILED,      // 执行失败
        DEADLOCK_DETECTED,     // 死锁检测
        INFINITE_LOOP,         // 无限循环
        NO_ASSIGNEE,           // 无候选人
        PERMISSION_ERROR,      // 权限错误
        DATA_INCONSISTENCY,    // 数据不一致
        MISSING_DATA,          // 数据缺失
        TIMEOUT_CRITICAL       // 严重超时
    }

    /**
     * 严重程度枚举
     */
    public enum Severity {
        LOW,       // 低
        MEDIUM,    // 中
        HIGH,      // 高
        CRITICAL   // 严重
    }
}

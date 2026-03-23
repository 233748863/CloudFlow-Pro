package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 异常告警记录
 * 对应 wf_anomaly_alert 表
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
@TableName("wf_anomaly_alert")
public class AnomalyAlert {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 流程实例ID */
    private String instanceId;

    /** 任务ID */
    private String taskId;

    /** 流程定义Key */
    private String processDefKey;

    /** 流程名称 */
    @TableField("process_def_name")
    private String processName;

    /** 节点Key */
    private String nodeKey;

    /** 节点名称 */
    private String nodeName;

    /** 异常类型 */
    private String anomalyType;

    /** 严重程度 */
    private String severity;

    /** 错误信息 */
    private String errorMessage;

    /** 堆栈跟踪 */
    private String stackTrace;

    /** 是否已解决：Y/N */
    private String resolved;

    /** 解决说明 */
    private String resolveNote;

    /** 告警时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime alertTime;

    /** 解决时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime resolveTime;

    /** 通知是否已发送：Y/N */
    private String notificationSent;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    /** 更新时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    /**
     * 异常类型统计数量。
     * 仅用于统计接口结果，不参与数据库读写。
     */
    @TableField(exist = false)
    private Long alertCount;
}

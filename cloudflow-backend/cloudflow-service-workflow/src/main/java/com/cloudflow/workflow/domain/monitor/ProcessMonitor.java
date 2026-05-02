package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 流程监控记录
 * 对应 wf_process_monitor 表
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
@TableName("wf_process_monitor")
public class ProcessMonitor {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 流程实例ID */
    private String instanceId;
    
    /** 流程定义ID */
    private String processDefId;
    
    /** 流程定义Key */
    private String processDefKey;
    
    /** 流程定义名称 */
    private String processDefName;
    
    /** 流程名称 */
    @TableField(exist = false)
    private String processName;
    
    /** 业务Key */
    private String businessKey;
    
    /** 流程状态 */
    private String status;
    
    /** 开始时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;
    
    /** 结束时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;
    
    /** 持续时间(毫秒) */
    private Long duration;
    
    /** 持续时间(毫秒) - 别名 */
    @TableField(exist = false)
    private Long durationMs;
    
    /** 节点数量 */
    private Integer nodeCount;
    
    /** 任务数量 */
    private Integer taskCount;
    
    /** 已完成任务数量 */
    @TableField(exist = false)
    private Integer completedTaskCount;
    
    /** 发起人ID */
    private Long startUserId;
    
    /** 发起人用户名 */
    private String startUserName;
    
    /** 发起人 */
    @TableField(exist = false)
    private String initiator;
    
    /** 发起人名称 */
    @TableField(exist = false)
    private String initiatorName;
    
    /** 错误信息 */
    private String errorMessage;
    
    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /** 更新时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    public String getProcessDefName() {
        return processDefName != null ? processDefName : processName;
    }

    public void setProcessDefName(String processDefName) {
        this.processDefName = processDefName;
        if (this.processName == null) {
            this.processName = processDefName;
        }
    }

    public String getProcessName() {
        return processName != null ? processName : processDefName;
    }

    public void setProcessName(String processName) {
        this.processName = processName;
        if (this.processDefName == null) {
            this.processDefName = processName;
        }
    }

    public Long getDurationMs() {
        return durationMs != null ? durationMs : duration;
    }

    public void setDurationMs(Long durationMs) {
        this.durationMs = durationMs;
    }
}

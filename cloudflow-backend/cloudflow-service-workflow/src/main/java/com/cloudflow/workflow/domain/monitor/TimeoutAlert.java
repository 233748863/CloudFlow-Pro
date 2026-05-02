package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 超时告警记录
 * 对应 wf_timeout_alert 表
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
@TableName("wf_timeout_alert")
public class TimeoutAlert {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 告警类型: TASK/PROCESS */
    private String alertType;
    
    /** 目标ID (任务ID或流程实例ID) */
    private String targetId;
    
    /** 目标名称 */
    private String targetName;
    
    /** 超时级别: REMIND/WARNING/CRITICAL */
    private String timeoutLevel;
    
    /** 超时时长(毫秒) */
    private Long timeoutDuration;
    
    /** 阈值(毫秒) */
    private Long threshold;
    
    /** 处理人ID */
    private Long assigneeId;
    
    /** 处理人名称 */
    private String assigneeName;
    
    /** 告警时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime alertTime;
    
    /** 通知已发送: Y/N */
    private String notificationSent;
    
    /** 已升级: Y/N */
    private String escalated;

    /** 升级接收人ID */
    private Long escalatedToId;

    /** 升级接收人名称 */
    private String escalatedToName;

    /** 升级时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime escalatedTime;
    
    /** 是否已解决: Y/N */
    private String resolved;

    /** 解决人ID */
    private Long resolvedById;

    /** 解决人名称 */
    private String resolvedByName;

    /** 解决说明 */
    private String resolveNote;
    
    /** 解决时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime resolveTime;
    
    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /** 更新时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

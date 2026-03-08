package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 性能统计数据
 * 对应 wf_performance_stats 表
 * 
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Data
@TableName("wf_performance_stats")
public class PerformanceStats {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /** 租户ID */
    private Long tenantId;
    
    /** 统计日期 */
    @TableField("stat_date")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate statDate;
    
    /** 流程定义Key */
    @TableField("process_def_key")
    private String processDefKey;
    
    /** 流程名称 */
    @TableField("process_def_name")
    private String processDefName;

    /** 流程名称兼容字段，仅用于接口返回 */
    @TableField(exist = false)
    private String processName;
    
    /** 总数 */
    @TableField("total_count")
    private Integer totalCount;
    
    /** 完成数 */
    @TableField("completed_count")
    private Integer completedCount;
    
    /** 失败数 */
    @TableField("failed_count")
    private Integer failedCount;
    
    /** 超时数 */
    @TableField("timeout_count")
    private Integer timeoutCount;
    
    /** 异常数 */
    @TableField("anomaly_count")
    private Integer anomalyCount;
    
    /** 平均持续时间(毫秒) */
    @TableField("avg_duration")
    private Long avgDuration;
    
    /** 平均持续时间(毫秒) - 别名 */
    @TableField(exist = false)
    private Long avgDurationMs;
    
    /** 最小持续时间(毫秒) */
    @TableField("min_duration")
    private Long minDuration;
    
    /** 最小持续时间(毫秒) - 别名 */
    @TableField(exist = false)
    private Long minDurationMs;
    
    /** 最大持续时间(毫秒) */
    @TableField("max_duration")
    private Long maxDuration;
    
    /** 最大持续时间(毫秒) - 别名 */
    @TableField(exist = false)
    private Long maxDurationMs;
    
    /** 成功率 */
    @TableField(exist = false)
    private Double successRate;
    
    /** 超时率 */
    @TableField(exist = false)
    private Double timeoutRate;
    
    /** 异常率 */
    @TableField(exist = false)
    private Double anomalyRate;
    
    /** 创建时间 */
    @TableField("create_time")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /** 更新时间 */
    @TableField("update_time")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

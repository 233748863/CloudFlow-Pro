package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
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
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate statDate;
    
    /** 流程定义Key */
    private String processDefKey;
    
    /** 流程名称 */
    private String processName;
    
    /** 总数 */
    private Integer totalCount;
    
    /** 完成数 */
    private Integer completedCount;
    
    /** 失败数 */
    private Integer failedCount;
    
    /** 超时数 */
    private Integer timeoutCount;
    
    /** 异常数 */
    private Integer anomalyCount;
    
    /** 平均持续时间(毫秒) */
    private Long avgDuration;
    
    /** 平均持续时间(毫秒) - 别名 */
    private Long avgDurationMs;
    
    /** 最小持续时间(毫秒) */
    private Long minDuration;
    
    /** 最小持续时间(毫秒) - 别名 */
    private Long minDurationMs;
    
    /** 最大持续时间(毫秒) */
    private Long maxDuration;
    
    /** 最大持续时间(毫秒) - 别名 */
    private Long maxDurationMs;
    
    /** 成功率 */
    private Double successRate;
    
    /** 超时率 */
    private Double timeoutRate;
    
    /** 异常率 */
    private Double anomalyRate;
    
    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    
    /** 更新时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

package com.cloudflow.workflow.domain.monitor;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 流程性能统计实体
 *
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Data
@TableName("wf_performance_stats")
public class PerformanceStats {

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
     * 统计日期
     */
    private LocalDate statDate;

    /**
     * 流程定义Key
     */
    private String processDefKey;

    /**
     * 流程定义名称
     */
    private String processDefName;

    /**
     * 总流程数
     */
    private Integer totalCount;

    /**
     * 完成数
     */
    private Integer completedCount;

    /**
     * 失败数
     */
    private Integer failedCount;

    /**
     * 平均执行时长(毫秒)
     */
    private Long avgDuration;

    /**
     * 最大执行时长(毫秒)
     */
    private Long maxDuration;

    /**
     * 最小执行时长(毫秒)
     */
    private Long minDuration;

    /**
     * 超时数
     */
    private Integer timeoutCount;

    /**
     * 异常数
     */
    private Integer anomalyCount;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

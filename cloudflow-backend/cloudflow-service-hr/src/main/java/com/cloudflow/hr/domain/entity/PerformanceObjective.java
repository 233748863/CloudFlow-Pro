package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 绩效目标。
 */
@Data
@TableName("hr_performance_objective")
public class PerformanceObjective {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String objectiveNo;

    private String cycleName;

    private LocalDate cycleStartDate;

    private LocalDate cycleEndDate;

    private String objectiveName;

    private BigDecimal totalTargetAmount;

    /**
     * 允许考核类型编码，逗号分隔。
     */
    private String categoryCodes;

    /**
     * 考核类型配置 JSON，保存自定义名称。
     */
    private String categoryConfig;

    /**
     * 指标配置 JSON，保存指标名称、单位和权重。
     */
    private String metricConfig;

    /**
     * 单项计分封顶百分比，默认 120。
     */
    private BigDecimal scoreCap;

    private BigDecimal archivedActualAmount;

    private BigDecimal archivedCompletionRate;

    private BigDecimal archivedCappedRate;

    private BigDecimal archivedScore;

    private String archivedGrade;

    private LocalDateTime archivedTime;

    private String archiveSnapshot;

    private String planProcessInstanceId;

    private String resultProcessInstanceId;

    /**
     * DRAFT / PLAN_APPROVING / PLAN_APPROVED / RESULT_APPROVING / COMPLETED / REJECTED / CANCELLED。
     */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableLogic
    private Integer deleted;
}

package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR-P0-1 360 评估关系实体。
 */
@Data
@TableName("hr_perf_evaluator")
public class HrPerfEvaluator {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long objectiveId;
    private Long assignmentId;
    private Long resultId;
    private Long evaluateeId;
    private String evaluateeName;
    private Long evaluatorId;
    private String evaluatorName;
    private String evaluatorSource;
    private BigDecimal weight;
    private String status;
    private LocalDateTime inviteTime;
    private Integer remindCount;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR-P0-1 360 评估打分实体。
 */
@Data
@TableName(value = "hr_perf_evaluator_response", autoResultMap = true)
public class HrPerfEvaluatorResponse {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long evaluatorId;
    private Long objectiveId;
    private Long evaluateeId;
    private String evaluatorSource;
    private BigDecimal score;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> dimensionScores;

    private String commentText;
    private LocalDateTime submitTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

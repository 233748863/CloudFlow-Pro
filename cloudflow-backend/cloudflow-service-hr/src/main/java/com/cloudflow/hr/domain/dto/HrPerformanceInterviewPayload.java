package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR-P1-3 绩效面谈记录。
 */
@Data
@TableName(value = "hr_performance_interview", autoResultMap = true)
public class HrPerformanceInterviewPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long objectiveId;
    private Long resultId;
    private Long evaluateeId;
    private String evaluateeName;
    private Long interviewerId;
    private String interviewerName;
    private Long hrObserverId;
    private String hrObserverName;
    private LocalDateTime interviewTime;
    private String location;
    private Integer durationMinutes;
    private String consensus;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode improvementItems;

    private String employeeFeedback;
    private String managerComment;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode attachmentUrls;

    private String status;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

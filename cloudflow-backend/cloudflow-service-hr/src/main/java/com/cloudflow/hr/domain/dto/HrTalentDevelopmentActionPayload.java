package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_talent_development_action")
public class HrTalentDevelopmentActionPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private Long sourceReviewId;
    private Long sourcePoolId;
    private String actionType;
    private String actionName;
    private Long mentorId;
    private Long ownerId;
    private LocalDate startDate;
    private LocalDate endDate;
    private Long trainingSessionId;
    private String status;
    private BigDecimal evaluationScore;
    private String evaluationNotes;
    private String description;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

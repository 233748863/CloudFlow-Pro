package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_work_injury_rehabilitation")
public class HrWorkInjuryRehabilitationPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long injuryId;
    private LocalDate returnDate;
    private String positionAdjustment;
    private Long newPositionId;
    private String abilityAssessment;
    private LocalDate followUpAt;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

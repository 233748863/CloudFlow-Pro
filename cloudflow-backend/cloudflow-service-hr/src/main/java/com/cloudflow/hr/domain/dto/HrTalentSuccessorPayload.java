package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_talent_successor")
public class HrTalentSuccessorPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long planId;
    private Long employeeId;
    private String readiness;
    private Integer rankOrder;
    private Long talentReviewParticipantId;
    private String developmentGap;
    private String retentionAction;
    private String status;
    private LocalDateTime notifiedAt;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

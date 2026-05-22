package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_talent_review_participant")
public class HrTalentReviewParticipantPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long reviewId;
    private Long employeeId;
    private BigDecimal performanceScore;
    private String performanceBand;
    private Integer potentialScore;
    private String potentialBand;
    private Integer gridCell;
    private String calibrationNotes;
    private String developActionSummary;
    private Long decidedBy;
    private LocalDateTime decidedAt;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

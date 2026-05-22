package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_dispute_arbitration", autoResultMap = true)
public class HrDisputeArbitrationPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long disputeId;
    private String arbitrationCommittee;
    private String caseNo;
    private LocalDate acceptedAt;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> hearingDates;

    private String awardNo;
    private String awardResult;
    private BigDecimal awardAmount;
    private LocalDate effectiveDate;
    private String awardDocUrl;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

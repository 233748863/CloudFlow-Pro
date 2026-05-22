package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_dispute_mediation")
public class HrDisputeMediationPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long disputeId;
    private Long mediatorId;
    private LocalDate mediationDate;
    private String location;
    private String processSummary;
    private String result;
    private String agreementUrl;
    private LocalDateTime signedAt;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

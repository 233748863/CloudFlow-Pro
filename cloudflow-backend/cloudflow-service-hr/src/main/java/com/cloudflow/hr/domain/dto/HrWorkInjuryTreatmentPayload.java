package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_work_injury_treatment", autoResultMap = true)
public class HrWorkInjuryTreatmentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long injuryId;
    private String hospitalName;
    private LocalDate admitDate;
    private LocalDate dischargeDate;
    private BigDecimal totalCost;
    private BigDecimal insuranceCovered;
    private BigDecimal selfPaid;

    @EncryptField
    private String diagnosis;

    private String treatmentSummary;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> receipts;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
}

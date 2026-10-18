package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName(value = "hr_employee_advance", autoResultMap = true)
public class HrEmployeeAdvance implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    private Long advanceId;
    private Long tenantId;
    private String advanceNo;
    private Long employeeId;
    private BigDecimal advanceAmount;
    private String purpose;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate applyDate;
    private String repayMode;
    private String repayStartMonth;
    private Integer repayMonths;
    private BigDecimal monthlyDeductAmount;
    private BigDecimal repaidAmount;
    private BigDecimal outstandingAmount;
    private BigDecimal reservedAmount;
    private BigDecimal writtenOffAmount;
    private String status;
    private String approvalStatus;
    private String instanceId;
    private Long paymentRequestId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime paidTime;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode ruleSnapshot;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

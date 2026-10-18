package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Getter;
import lombok.Setter;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@TableName("hr_overtime_request")
public class HrOvertimeRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long requestId;
    private Long tenantId;
    private String requestNo;
    private Long employeeId;
    private Long deptId;
    private LocalDate workDate;
    private LocalDate attendanceDate;
    private Long shiftId;
    private Long ruleId;
    private Long calendarId;
    private String dateType;
    private Integer triplePayFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;
    private Integer requestedMinutes;
    private Integer actualMinutes;
    private BigDecimal actualHours;
    private Integer approvedMinutes;
    private BigDecimal approvedHours;
    private Long overtimeTypeId;
    private String settleMode;
    private BigDecimal rateMultiplier;
    private BigDecimal compensatoryRatio;
    private Long salaryComponentId;
    private Long leaveTypeId;
    private Long leavePeriodId;
    private BigDecimal compensatoryQuantity;
    private Long payrollPeriodId;
    private String currency;
    @JsonIgnore
    private String hourlyRateCipher;
    @JsonIgnore
    private String settlementAmountCipher;
    private String reason;
    private String status;
    private String instanceId;
    private Long reviewedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime reviewedTime;
    private String reviewNote;
    private Long pricedBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime pricedTime;
    @JsonIgnore
    private String priceNote;
    @JsonIgnore
    private String calculationSnapshot;
    @JsonIgnore
    private String policySnapshot;
    private String settlementStatus;
    private Integer settledFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime settleTime;
    private Long compChangeId;
    private Long leaveLedgerId;
    private Long payrollCorrectionId;
    @JsonIgnore
    private String settlementResolution;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String lastErrorCode;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String lastErrorMessage;
    @JsonIgnore
    private String idempotencyKey;
    @JsonIgnore
    private String requestDigest;
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

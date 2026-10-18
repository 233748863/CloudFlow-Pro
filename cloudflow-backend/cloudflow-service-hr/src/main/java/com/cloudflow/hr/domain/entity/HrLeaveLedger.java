package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_leave_ledger")
public class HrLeaveLedger implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long ledgerId;
    private Long tenantId;
    private Long employeeId;
    private Long leaveTypeId;
    private Long leavePeriodId;
    private String transactionType;
    private String sourceBizType;
    private String sourceBizId;
    private String sourceEventKey;
    private BigDecimal leaveDays;
    private String quantityUnit;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate fromDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate toDate;
    private Integer carryForwardFlag;
    private Integer expiredFlag;
    private Integer lwpFlag;
    private Long reversalOfId;
    private Long operatorId;
    private String remark;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}

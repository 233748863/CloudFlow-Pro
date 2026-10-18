package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.io.Serializable;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_payroll_batch", autoResultMap = true)
public class HrPayrollBatch implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long batchId;
    private Long tenantId;
    private String batchNo;
    private Long payrollPeriodId;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate postingDate;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> filterDeptIds;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> filterPositionIds;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> filterJobLevelIds;
    private String filterEmployeeType;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Long> filterEmployeeIds;
    private Integer employeeCount;
    private Integer validateAttendanceFlag;
    private Integer deductUnverifiedFlag;
    private String status;
    private Integer slipCreatedFlag;
    private Integer slipSubmittedFlag;
    private BigDecimal totalGross;
    private BigDecimal totalDeduction;
    private BigDecimal totalTax;
    private BigDecimal totalNet;
    private String errorMessage;
    private String instanceId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime calcStartTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime calcEndTime;
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

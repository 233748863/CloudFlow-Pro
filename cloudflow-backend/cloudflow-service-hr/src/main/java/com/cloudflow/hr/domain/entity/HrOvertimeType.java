package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.cloudflow.common.encrypt.annotation.EncryptField;
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
@TableName("hr_overtime_type")
public class HrOvertimeType implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long typeId;
    private Long tenantId;
    private String typeCode;
    private String typeName;
    private String applicableDayType;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal rateMultiplier;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long salaryComponentId;
    private Integer compensatoryFlag;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal compensatoryRatio;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long compensatoryLeaveTypeId;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal maxHoursPerMonth;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal maxHoursPerDay;
    private Integer needApprovalFlag;
    private Integer status;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remark;
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

package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_overtime_application")
public class OvertimeApplication {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String applicationNo;

    private Long employeeId;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private BigDecimal duration;

    private String overtimeType;

    private String reason;

    private String compensationType;

    private BigDecimal compensationHours;

    private BigDecimal quotaAmount;

    private String matchedSlots;

    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableLogic
    private Integer deleted;
}

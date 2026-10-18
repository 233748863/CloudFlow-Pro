package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("oa_timesheet_detail")
public class OaTimesheetDetail implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long detailId;

    private Long tenantId;

    private Long timesheetId;

    private Long projectId;

    private String projectName;

    private Long taskId;

    private Long activityTypeId;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate workDate;

    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime fromTime;

    @JsonFormat(pattern = "HH:mm:ss")
    private LocalTime toTime;

    private BigDecimal hours;

    private Integer billableFlag;

    private BigDecimal costingRate;

    private BigDecimal costingAmount;

    private BigDecimal billingRate;

    private BigDecimal billingAmount;

    private Long reversalOfDetailId;

    private String description;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

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

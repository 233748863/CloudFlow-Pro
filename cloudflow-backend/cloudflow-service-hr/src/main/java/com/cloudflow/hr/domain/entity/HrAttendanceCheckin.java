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
@TableName("hr_attendance_checkin")
public class HrAttendanceCheckin implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long checkinId;
    private Long tenantId;
    private Long employeeId;
    private String logType;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime checkTime;
    private Long shiftId;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate attendanceDate;
    private String deviceId;
    private String checkMethod;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private String locationName;
    private Integer locationValidFlag;
    private Integer offshiftFlag;
    private Long overtimeTypeId;
    private Long overtimeRequestId;
    private Integer skipAutoFlag;
    private Long attendanceRecordId;
    private Long photoFileId;
    private String remark;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}

package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_attendance_monthly")
public class HrAttendanceMonthlyPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private Integer year;
    private Integer month;
    private BigDecimal workDays;
    private BigDecimal actualDays;
    private Integer lateTimes;
    private Integer earlyTimes;
    private BigDecimal absentDays;
    private BigDecimal leaveDays;
    private BigDecimal overtimeHours;
    private BigDecimal attendanceRate;
    private String status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;
}

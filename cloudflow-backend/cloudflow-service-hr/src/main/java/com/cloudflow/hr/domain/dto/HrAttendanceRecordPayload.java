package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_attendance_record")
public class HrAttendanceRecordPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private LocalDate attendanceDate;
    private Long shiftId;
    private Integer workMinutes;
    private Integer expectedMinutes;
    private Integer lateMinutes;
    private Integer earlyExitMinutes;
    private Integer overtimeMinutes;
    private LocalDateTime firstCheckinTime;
    private LocalDateTime lastCheckoutTime;
    private Integer checkinCount;
    private Integer halfDayFlag;
    private Integer absentFlag;
    private String dateType;
    private String status;
    private LocalDateTime recalcTime;
    private Integer manualAdjustedFlag;
    private Long appealId;
    private String remark;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

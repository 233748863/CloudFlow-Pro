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
    private String checkType;
    private LocalDateTime checkTime;
    private LocalDateTime expectedTime;
    private Integer deviationMinutes;
    private String checkMethod;
    private String location;
    private String status;
    private String remark;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

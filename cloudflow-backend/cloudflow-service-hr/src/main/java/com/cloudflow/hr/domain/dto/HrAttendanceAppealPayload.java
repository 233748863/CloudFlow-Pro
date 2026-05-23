package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR-P1-4 考勤异常申诉。
 */
@Data
@TableName(value = "hr_attendance_appeal", autoResultMap = true)
public class HrAttendanceAppealPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String appealNo;
    private Long employeeId;
    private String employeeName;
    private Long deptId;
    private String deptName;
    private Long attendanceRecordId;
    private LocalDate attendanceDate;
    private String exceptionType;
    private String reason;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private JsonNode evidenceUrls;

    private LocalDateTime expectedCheckIn;
    private LocalDateTime expectedCheckOut;
    private String status;
    private String instanceId;
    private Long managerId;
    private String managerRemark;
    private Long hrReviewerId;
    private String hrRemark;
    private LocalDateTime approvedCheckIn;
    private LocalDateTime approvedCheckOut;
    private String finalDecision;
    private LocalDateTime decidedTime;

    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

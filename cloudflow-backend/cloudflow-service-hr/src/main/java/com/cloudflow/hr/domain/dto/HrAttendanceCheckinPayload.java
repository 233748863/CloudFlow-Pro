package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class HrAttendanceCheckinPayload {
    private Long employeeId;
    private String logType;
    private LocalDateTime checkTime;
    private Long shiftId;
    private String deviceId;
    private String checkMethod;
    private BigDecimal latitude;
    private BigDecimal longitude;
    private String locationName;
    private Integer locationValidFlag;
    private Long overtimeTypeId;
    private Long overtimeRequestId;
    private Integer skipAutoFlag;
    private Long photoFileId;
    private String remark;
}

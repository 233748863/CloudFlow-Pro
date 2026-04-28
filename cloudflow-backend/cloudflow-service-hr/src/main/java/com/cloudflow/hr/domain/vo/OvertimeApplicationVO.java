package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class OvertimeApplicationVO {

    private Long id;

    private String applicationNo;

    private Long employeeId;

    private String employeeName;

    private String employeeNo;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private BigDecimal duration;

    private String overtimeType;

    private String overtimeTypeName;

    private String reason;

    private String compensationType;

    private String compensationTypeName;

    private BigDecimal compensationHours;

    private BigDecimal quotaAmount;

    private String matchedSlots;

    private String status;

    private String statusName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}

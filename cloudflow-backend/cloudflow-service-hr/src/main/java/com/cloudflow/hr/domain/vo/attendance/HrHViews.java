package com.cloudflow.hr.domain.vo.attendance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;

public final class HrHViews {
    @Getter @Setter
    @cn.idev.excel.annotation.ExcelIgnoreUnannotated
    public static class OvertimeExportVO {
        @cn.idev.excel.annotation.ExcelProperty("申请ID") private String requestId;
        @cn.idev.excel.annotation.ExcelProperty("申请编号") private String requestNo;
        @cn.idev.excel.annotation.ExcelProperty("员工") private String employeeName;
        @cn.idev.excel.annotation.ExcelProperty("部门") private String deptName;
        @cn.idev.excel.annotation.ExcelProperty("加班日期") private String workDate;
        @cn.idev.excel.annotation.ExcelProperty("加班类型") private String overtimeTypeName;
        @cn.idev.excel.annotation.ExcelProperty("报酬方式") private String settleMode;
        @cn.idev.excel.annotation.ExcelProperty("实际分钟") private Integer actualMinutes;
        @cn.idev.excel.annotation.ExcelProperty("核定分钟") private Integer approvedMinutes;
        @cn.idev.excel.annotation.ExcelProperty("审批状态") private String status;
        @cn.idev.excel.annotation.ExcelProperty("执行状态") private String settlementStatus;
    }
    private HrHViews() {}

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeListVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long requestId;
        private String requestNo;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long employeeId;
        private String employeeName;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long deptId;
        private String deptName;
        private LocalDate workDate;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime startTime;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime endTime;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long overtimeTypeId;
        private String overtimeTypeName;
        private String settleMode;
        private Integer requestedMinutes;
        private Integer actualMinutes;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal actualHours;
        private Integer approvedMinutes;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal approvedHours;
        private String status;
        private String settlementStatus;
        private Integer settledFlag;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime createTime;
        private Integer version;
        private List<String> allowedActions;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeDetailVO extends OvertimeListVO {
        private LocalDate attendanceDate;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long shiftId;
        private String shiftName;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long ruleId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long calendarId;
        private String dateType;
        private Integer triplePayFlag;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal rateMultiplier;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal compensatoryRatio;
        private String reason;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long reviewedBy;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime reviewedTime;
        private String reviewNote;
        private String instanceId;
        private CalculationSummaryVO calculationSummary;
        private List<RuleWarningVO> ruleWarnings;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime settleTime;
        private String lastErrorCode;
        private String lastErrorMessage;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeSettlementVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long requestId;
        private String settleMode;
        private String settlementStatus;
        private Integer settledFlag;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime settleTime;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long leaveTypeId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long leavePeriodId;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal compensatoryQuantity;
        private String quantityUnit;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long compChangeId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long leaveLedgerId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long payrollPeriodId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long payrollCorrectionId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long salaryComponentId;
        private String currency;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal hourlyRate;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal settlementAmount;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long pricedBy;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime pricedTime;
        private String priceNote;
        private ResolutionVO resolution;
        private OvertimeRoundingVO rounding;
        private String lastErrorCode;
        private String lastErrorMessage;
        private List<String> allowedActions;
        private Integer version;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ResolutionVO {
        private String action;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long originalPeriodId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long targetPeriodId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long originalSlipId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long correctionSlipId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long operatorId;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime handledTime;
        private String reason;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeRoundingVO {
        private String policy;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long sourcePeriodId;
        private Integer rawMinutes;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal ratio;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal currentCreditHours;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal cumulativeCreditHours;
        private Integer residualNumerator;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimePreviewVO {
        private LocalDate workDate;
        private LocalDate attendanceDate;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long calendarId;
        private String dateType;
        private Integer triplePayFlag;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long overtimeTypeId;
        private String overtimeTypeName;
        private Integer requestedMinutes;
        private Integer actualMinutes;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal actualHours;
        private Integer thresholdMinutes;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal rateMultiplier;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal compensatoryRatio;
        private List<String> eligibleSettleModes;
        private List<TimeSegmentVO> segments;
        private List<RuleWarningVO> warnings;
        private List<BusinessBlockerVO> blockers;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeOptionsVO {
        private List<OvertimeOptionVO> types;
        private String businessTimezone;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeOptionVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long typeId;
        private String typeName;
        private String applicableDayType;
        private List<String> eligibleSettleModes;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OvertimeTypeVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long typeId;
        private String typeCode;
        private String typeName;
        private String applicableDayType;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal rateMultiplier;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long salaryComponentId;
        private Integer compensatoryFlag;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal compensatoryRatio;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long compensatoryLeaveTypeId;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal maxHoursPerMonth;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal maxHoursPerDay;
        private Integer needApprovalFlag;
        private String remark;
        private Integer status;
        private Integer version;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime createTime;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime updateTime;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShiftRequestVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long requestId;
        private String requestNo;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long employeeId;
        private String employeeName;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long deptId;
        private String deptName;
        private String requestMode;
        private LocalDate fromDate;
        private LocalDate toDate;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long fromShiftId;
        private String fromShiftName;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long toShiftId;
        private String toShiftName;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long swapEmployeeId;
        private String swapEmployeeName;
        private String peerAcceptanceStatus;
        private String status;
        private String applicationStatus;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime createTime;
        private Integer version;
        private List<String> allowedActions;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShiftRequestDetailVO extends ShiftRequestVO {
        private String reason;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long fromRuleId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long toRuleId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long peerRespondedBy;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime peerRespondedTime;
        private String peerResponseNote;
        private Integer minimumRestMinutes;
        private String instanceId;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long approverId;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime appliedTime;
        private List<ShiftSlotVO> beforeSlots;
        private List<ShiftSlotVO> afterSlots;
        private String lastErrorCode;
        private String lastErrorMessage;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShiftInvitationVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long requestId;
        private String requestNo;
        private String applicantName;
        private LocalDate attendanceDate;
        private ShiftSlotVO ownBefore;
        private ShiftSlotVO ownAfter;
        private ShiftSlotVO applicantBefore;
        private ShiftSlotVO applicantAfter;
        private String reason;
        private String peerAcceptanceStatus;
        private String status;
        private Integer version;
        private List<String> allowedActions;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShiftOptionsVO {
        private LocalDate attendanceDate;
        private ShiftSlotVO ownSlot;
        private List<EligibleShiftVO> eligibleShifts;
        private List<EligiblePeerVO> eligiblePeers;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EligibleShiftVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long shiftId;
        private String shiftName;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long ruleId;
        private LocalTime startTime;
        private LocalTime endTime;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EligiblePeerVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long employeeId;
        private String name;
        private String shiftName;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShiftPreviewVO {
        private List<ShiftSlotVO> beforeSlots;
        private List<ShiftSlotVO> afterSlots;
        private List<RestGapVO> restGaps;
        private Integer minimumRestMinutes;
        private List<BusinessBlockerVO> blockers;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RestGapVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long employeeId;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime previousEnd;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime nextStart;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long gapMinutes;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TimeSegmentVO {
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime startTime;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime endTime;
        private Integer minutes;
        private String kind;
        @JsonSerialize(contentUsing = ToStringSerializer.class)
        private List<Long> sourceCheckinIds;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ShiftSlotVO {
        @JsonSerialize(using = ToStringSerializer.class)
        private Long employeeId;
        private LocalDate attendanceDate;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long assignmentId;
        private Integer assignmentVersion;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long shiftId;
        private Integer shiftVersion;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long ruleId;
        private Integer ruleVersion;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime startTime;
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
        private LocalDateTime endTime;
        @JsonSerialize(using = ToStringSerializer.class)
        private Long calendarId;
        private String dateType;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RuleWarningVO {
        private String ruleCode;
        private String dimension;
        private String effect;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal limitHours;
        @JsonSerialize(using = ToStringSerializer.class)
        private BigDecimal actualHours;
        private String message;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class BusinessBlockerVO {
        private String code;
        private String message;
    }

    @Getter @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CalculationSummaryVO {
        private List<TimeSegmentVO> segments;
        private Integer actualMinutes;
        private Integer excludedMinutes;
        private Integer thresholdMinutes;
        private Integer expectedMinutes;
        private Integer assignmentVersion;
        private Integer shiftVersion;
        private Integer ruleVersion;
    }
}

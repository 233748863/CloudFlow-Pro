package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.cloudflow.hr.domain.entity.*;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public interface HrHMapper {
    Map<String, Object> assignment(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("date") LocalDate date);
    Map<String, Object> calendar(@Param("tenantId") Long tenantId, @Param("calendarId") Long calendarId, @Param("date") LocalDate date);
    List<Long> fallbackCalendars(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    Map<String, Object> definition(@Param("tenantId") Long tenantId, @Param("processKey") String processKey);
    Long activeUser(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<Long> permissionUsers(@Param("tenantId") Long tenantId, @Param("permission") String permission, @Param("deptId") Long deptId);
    List<Long> roleUsers(@Param("tenantId") Long tenantId, @Param("role") String role);
    HrPayrollCorrection correctionLocked(@Param("tenantId") Long tenantId, @Param("id") Long id);
    @InterceptorIgnore(tenantLine = "true")
    List<HrEmployee> lockEmployees(@Param("tenantId") Long tenantId, @Param("employeeIds") List<Long> employeeIds);
    HrOvertimeRequest overtimeLocked(@Param("tenantId") Long tenantId, @Param("id") Long id);
    HrShiftRequest shiftLocked(@Param("tenantId") Long tenantId, @Param("id") Long id);
    HrOvertimeRequest overtimeReplay(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("key") String key);
    HrShiftRequest shiftReplay(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("key") String key);
    HrOvertimeRequest correctionSource(@Param("tenantId") Long tenantId, @Param("correctionId") Long correctionId);
    List<HrAttendanceCheckin> checkins(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
    long overtimeOverlap(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("excludedId") Long excludedId,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
    List<HrTimeRequest> leaveOverlap(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
    long shiftOverlap(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("excludedId") Long excludedId,
            @Param("from") LocalDate from, @Param("to") LocalDate to);
    long actualMinutes(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("excludedId") Long excludedId,
            @Param("from") LocalDate from, @Param("to") LocalDate to);
    long approvedMinutes(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("from") LocalDate from, @Param("to") LocalDate to);
    List<Map<String, Object>> approvedDays(@Param("tenantId") Long tenantId, @Param("employeeIds") List<Long> employeeIds,
            @Param("from") LocalDate from, @Param("to") LocalDate to);
    String compensationCurrency(@Param("tenantId") Long tenantId, @Param("compensationId") Long compensationId);
    List<HrOvertimeRequest> settledCredits(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
            @Param("leaveTypeId") Long leaveTypeId, @Param("periodId") Long periodId);
    HrCompChange changeSource(@Param("tenantId") Long tenantId, @Param("requestId") String requestId);
    int insertOvertimeChange(@Param("row") HrCompChange row, @Param("zeroCipher") String zeroCipher, @Param("amountCipher") String amountCipher);
    HrLeaveLedger ledgerSource(@Param("tenantId") Long tenantId, @Param("eventKey") String eventKey);
    HrPayrollPeriod payrollPeriodLocked(@Param("tenantId") Long tenantId, @Param("id") Long id);
    long pendingPayroll(@Param("tenantId") Long tenantId, @Param("periodId") Long periodId, @Param("employeeId") Long employeeId);
    long pendingLeave(@Param("tenantId") Long tenantId, @Param("periodId") Long periodId);
    long confirmedMonth(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("month") String month);
    long manualAttendance(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("from") LocalDate from, @Param("to") LocalDate to);
    long rawAttendance(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("date") LocalDate date,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
    List<HrScheduleAssignment> sourceAssignments(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
    List<HrShiftRequest> protectedShifts(@Param("tenantId") Long tenantId);
    List<HrOvertimeRequest> protectedOvertimes(@Param("tenantId") Long tenantId);
}

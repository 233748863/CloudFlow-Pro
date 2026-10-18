package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.vo.attendance.HrAttendanceMonthlyVO;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceRecordVO;
import com.cloudflow.hr.mapper.HrHMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.cloudflow.hr.service.HrRuleSupport.tenantId;

@Service
@RequiredArgsConstructor
public class HrHAttendanceSummaryService {
    private final HrHMapper mapper;

    public List<HrAttendanceRecordVO> records(List<HrAttendanceRecordVO> records) {
        if (records.isEmpty()) return records;
        List<LocalDate> dates = records.stream().map(HrAttendanceRecordVO::getAttendanceDate).sorted().toList();
        Map<String, Integer> totals = totals(records.stream().map(HrAttendanceRecordVO::getEmployeeId).distinct().toList(), dates.get(0), dates.get(dates.size() - 1), false);
        for (HrAttendanceRecordVO record : records) record.setApprovedOvertimeMinutes(totals.getOrDefault(record.getEmployeeId() + ":" + record.getAttendanceDate(), 0));
        return records;
    }

    public List<HrAttendanceMonthlyVO> months(List<HrAttendanceMonthlyVO> months) {
        if (months.isEmpty()) return months;
        List<YearMonth> dates = months.stream().map(month -> YearMonth.of(month.getYear(), month.getMonth())).sorted().toList();
        Map<String, Integer> totals = totals(months.stream().map(HrAttendanceMonthlyVO::getEmployeeId).distinct().toList(), dates.get(0).atDay(1), dates.get(dates.size() - 1).atEndOfMonth(), true);
        for (HrAttendanceMonthlyVO month : months) {
            int minutes = totals.getOrDefault(month.getEmployeeId() + ":" + YearMonth.of(month.getYear(), month.getMonth()), 0);
            month.setApprovedOvertimeMinutes(minutes);
            month.setApprovedOvertimeHours(HrOvertimeCalculator.hours(minutes));
        }
        return months;
    }

    private Map<String, Integer> totals(List<Long> employees, LocalDate from, LocalDate to, boolean monthly) {
        Map<String, Integer> result = new HashMap<>();
        for (Map<String, Object> row : mapper.approvedDays(tenantId(), employees, from, to)) {
            String date = row.get("attendanceDate").toString();
            String key = row.get("employeeId") + ":" + (monthly ? YearMonth.from(LocalDate.parse(date)) : date);
            result.merge(key, Math.toIntExact(((Number) row.get("approvedMinutes")).longValue()), Math::addExact);
        }
        return result;
    }
}

package com.cloudflow.common.holiday.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.cloudflow.common.holiday.domain.EmployeeCalendarAssignment;
import com.cloudflow.common.holiday.domain.EmployeeCalendarDay;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 员工排班、部门归属查询。hr_shift 的日历字段在 D 批新增，当前不存在时由服务跳过该级。
 */
@Mapper
public interface HolidayResolverMapper {
    default List<EmployeeCalendarDay> selectEmployeeCalendarDays(Long employeeId, List<LocalDate> dates, Long tenantId) {
        Objects.requireNonNull(dates, "dates");
        if (dates.isEmpty()) return List.of();
        List<LocalDate> orderedDates = new ArrayList<>(dates);
        Collections.sort(orderedDates);
        List<EmployeeCalendarAssignment> assignments = selectEmployeeCalendarAssignments(employeeId,
                orderedDates.get(0), orderedDates.get(orderedDates.size() - 1), tenantId);
        List<EmployeeCalendarDay> result = new ArrayList<>(orderedDates.size());
        for (LocalDate date : orderedDates) {
            Long shiftId = null;
            Long calendarId = null;
            for (EmployeeCalendarAssignment assignment : assignments) {
                if (assignment.includes(date)) {
                    shiftId = assignment.shiftId();
                    calendarId = assignment.calendarId();
                    break;
                }
            }
            result.add(new EmployeeCalendarDay(date, shiftId, calendarId));
        }
        return result;
    }

    List<EmployeeCalendarAssignment> selectEmployeeCalendarAssignments(@Param("employeeId") Long employeeId,
            @Param("firstDate") LocalDate firstDate, @Param("lastDate") LocalDate lastDate, @Param("tenantId") Long tenantId);
    Long selectEmployeeDeptId(@Param("employeeId") Long employeeId, @Param("tenantId") Long tenantId);
    Long selectAssignedShiftId(@Param("employeeId") Long employeeId, @Param("date") java.time.LocalDate date,
                               @Param("tenantId") Long tenantId);
    Long selectAssignedRuleId(@Param("employeeId") Long employeeId, @Param("date") java.time.LocalDate date,
                              @Param("tenantId") Long tenantId);
    Long selectShiftCalendarId(@Param("shiftId") Long shiftId, @Param("tenantId") Long tenantId);
    Long selectDeptCalendarId(@Param("deptId") Long deptId, @Param("tenantId") Long tenantId);
    @InterceptorIgnore(tenantLine = "true")
    boolean hasShiftCalendarColumn();
    long countDeptCalendarReferences(@Param("calendarId") Long calendarId, @Param("tenantId") Long tenantId);
    long countShiftCalendarReferences(@Param("calendarId") Long calendarId, @Param("tenantId") Long tenantId);
    @InterceptorIgnore(tenantLine = "true")
    boolean hasCrmSlaCalendarColumn();
    long countCrmSlaCalendarReferences(@Param("calendarId") Long calendarId, @Param("tenantId") Long tenantId);
}

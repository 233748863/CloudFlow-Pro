package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.bo.AttendanceRuleResolution;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.vo.EffectiveAttendanceRuleVO;

import java.time.LocalDate;
import java.util.Map;

public interface AttendanceRuleResolver {

    AttendanceRuleResolution resolve(Long employeeId, LocalDate date);

    AttendanceRuleResolution resolve(Employee employee, LocalDate date);

    SchedulePlan resolveSchedulePlan(Employee employee, LocalDate date);

    Map<LocalDate, SchedulePlan> resolveSchedulePlans(Employee employee, LocalDate startDate, LocalDate endDate);

    EffectiveAttendanceRuleVO toEffectiveRuleVO(AttendanceRuleResolution resolution);

    boolean isWorkday(AttendanceRuleResolution resolution);
}

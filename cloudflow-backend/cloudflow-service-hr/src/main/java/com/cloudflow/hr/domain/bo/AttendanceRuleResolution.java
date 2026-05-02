package com.cloudflow.hr.domain.bo;

import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.domain.entity.SchedulePlan;
import com.cloudflow.hr.domain.entity.ScheduleRule;
import com.cloudflow.hr.domain.entity.ScheduleRuleAssignment;
import com.cloudflow.hr.domain.entity.Shift;
import com.cloudflow.hr.domain.entity.WorkCalendar;
import lombok.Data;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

@Data
public class AttendanceRuleResolution {

    private Employee employee;

    private ScheduleRule rule;

    private ScheduleRuleAssignment assignment;

    private WorkCalendar calendar;

    private SchedulePlan schedulePlan;

    private Shift shift;

    private LocalDate attendanceDate;

    private String sourceType;

    private Long sourceTargetId;

    private String sourceTargetName;

    private String dayType;

    private Map<String, Object> config = new HashMap<>();
}

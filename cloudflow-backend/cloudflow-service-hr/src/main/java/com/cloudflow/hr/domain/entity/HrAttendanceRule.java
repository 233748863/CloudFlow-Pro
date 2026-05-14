package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrAttendanceRulePayload;

@TableName(value = "hr_attendance_rule", autoResultMap = true)
public class HrAttendanceRule extends HrAttendanceRulePayload {
}

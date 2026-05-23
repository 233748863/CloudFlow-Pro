package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrAttendanceAppealPayload;

@TableName(value = "hr_attendance_appeal", autoResultMap = true)
public class HrAttendanceAppeal extends HrAttendanceAppealPayload {
}

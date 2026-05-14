package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrLeaveTypePayload;

@TableName(value = "hr_leave_type", autoResultMap = true)
public class HrLeaveType extends HrLeaveTypePayload {
}

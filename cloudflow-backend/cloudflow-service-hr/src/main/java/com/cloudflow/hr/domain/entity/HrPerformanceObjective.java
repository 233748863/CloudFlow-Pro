package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrPerformanceObjectivePayload;

@TableName(value = "hr_performance_objective", autoResultMap = true)
public class HrPerformanceObjective extends HrPerformanceObjectivePayload {
}

package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrPerformanceInterviewPayload;

@TableName(value = "hr_performance_interview", autoResultMap = true)
public class HrPerformanceInterview extends HrPerformanceInterviewPayload {
}

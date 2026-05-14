package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrInterviewPayload;

@TableName(value = "hr_interview", autoResultMap = true)
public class HrInterview extends HrInterviewPayload {
}

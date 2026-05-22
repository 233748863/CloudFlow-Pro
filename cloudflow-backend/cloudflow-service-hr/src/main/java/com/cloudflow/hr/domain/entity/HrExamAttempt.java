package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrExamAttemptPayload;

@TableName(value = "hr_exam_attempt", autoResultMap = true)
public class HrExamAttempt extends HrExamAttemptPayload {
}

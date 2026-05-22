package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrTrainingCoursePayload;

@TableName(value = "hr_training_course", autoResultMap = true)
public class HrTrainingCourse extends HrTrainingCoursePayload {
}

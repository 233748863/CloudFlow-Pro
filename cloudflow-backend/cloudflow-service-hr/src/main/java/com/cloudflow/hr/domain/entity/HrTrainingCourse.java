package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrTrainingCoursePayload;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@TableName(value = "hr_training_course", autoResultMap = true)
public class HrTrainingCourse extends HrTrainingCoursePayload {
    private Long skillId;
    private Integer targetLevel;
}

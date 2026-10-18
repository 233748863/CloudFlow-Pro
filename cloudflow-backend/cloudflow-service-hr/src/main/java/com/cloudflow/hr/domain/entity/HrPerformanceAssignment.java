package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrPerformanceAssignmentPayload;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
@TableName("hr_performance_assignment")
public class HrPerformanceAssignment extends HrPerformanceAssignmentPayload {
    private Long cycleId;
}

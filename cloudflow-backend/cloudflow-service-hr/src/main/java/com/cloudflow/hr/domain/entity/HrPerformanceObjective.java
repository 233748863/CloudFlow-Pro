package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrPerformanceObjectivePayload;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
@TableName(value = "hr_performance_objective", autoResultMap = true)
public class HrPerformanceObjective extends HrPerformanceObjectivePayload {
    private Long cycleId;
    private Long kraId;
}

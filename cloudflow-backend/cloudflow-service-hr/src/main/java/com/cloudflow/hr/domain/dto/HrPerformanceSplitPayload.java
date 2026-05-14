package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.util.List;

@Data
public class HrPerformanceSplitPayload {

    private List<HrPerformanceAssignmentChildPayload> children;
}

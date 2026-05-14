package com.cloudflow.hr.domain.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class HrPerformanceObjectiveTreePayload {

    private String objectiveNo;
    private String cycleName;
    private String cycleStartDate;
    private String cycleEndDate;
    private String objectiveName;
    private BigDecimal totalTargetAmount;
    private BigDecimal scoreCap;
    private List<String> categoryCodes;
    private List<JsonNode> categoryDefinitions;
    private List<JsonNode> metrics;
    private List<JsonNode> departmentAssignments;
}

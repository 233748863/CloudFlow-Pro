package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class SimulationNodeDetail {
    private String nodeId;
    private String nodeType;
    private String title;
    private boolean reached;
    private Boolean conditionResult;
    private List<String> resolvedAssignees = new ArrayList<>();
    private String branchTaken;
    private List<String> warnings = new ArrayList<>();
}

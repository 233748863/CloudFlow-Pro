package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.Map;

@Data
public class SimulationRequest {
    private String definitionId;
    private Map<String, Object> variables;
    private boolean simulateAllBranches;
    private int maxDepth = 50;
}

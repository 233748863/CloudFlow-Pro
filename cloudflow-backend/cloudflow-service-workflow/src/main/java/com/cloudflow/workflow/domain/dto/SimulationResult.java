package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.ArrayList;
import java.util.List;

@Data
public class SimulationResult {
    private boolean success;
    private List<SimulationPath> paths = new ArrayList<>();
    private List<String> warnings = new ArrayList<>();
    private List<String> errors = new ArrayList<>();
    private List<SimulationNodeDetail> nodeDetails = new ArrayList<>();
    private int totalNodes;
    private int reachableNodes;
    private List<String> unreachableNodes = new ArrayList<>();

    @Data
    public static class SimulationPath {
        private List<String> nodeIds = new ArrayList<>();
        private List<String> nodeTitles = new ArrayList<>();
        private String terminationType;
    }
}

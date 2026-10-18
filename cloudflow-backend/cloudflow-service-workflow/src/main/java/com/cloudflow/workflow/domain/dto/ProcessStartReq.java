package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.Map;
import java.util.List;

@Data
public class ProcessStartReq {
    private String processDefKey;
    private String businessKey;
    private Map<String, Object> variables;
    private Map<String, List<Long>> nodeAssignees;
    private String draftId;
    private Integer expectedVersion;
}

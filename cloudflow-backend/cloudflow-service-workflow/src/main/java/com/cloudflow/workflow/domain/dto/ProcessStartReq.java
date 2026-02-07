package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.Map;

@Data
public class ProcessStartReq {
    private String processDefKey;
    private String businessKey;
    private Map<String, Object> variables;
}

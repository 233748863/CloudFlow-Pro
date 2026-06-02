package com.cloudflow.workflow.domain.dto;

import lombok.Data;

import java.util.Map;

@Data
public class InternalProcessStartReq {

    private String processDefKey;

    private String businessKey;

    private Long startUserId;

    private String startUserName;

    private Map<String, Object> variables;
}

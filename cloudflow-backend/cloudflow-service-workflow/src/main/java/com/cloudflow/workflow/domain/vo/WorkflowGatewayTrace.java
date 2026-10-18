package com.cloudflow.workflow.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class WorkflowGatewayTrace {
    private String roundId;
    private String nodeKey;
    private String nodeName;
    private String joinNodeKey;
    private String joinType;
    private Integer arrivedCount;
    private Integer expectedCount;
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime releasedTime;
}

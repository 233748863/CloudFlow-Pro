package com.cloudflow.workflow.domain.dto;

import lombok.Data;

import java.util.List;

/**
 * 加签/减签入参。
 */
@Data
public class SignatureChangeRequest {

    private String taskId;

    private List<Long> userIds;

    private String comment;
}

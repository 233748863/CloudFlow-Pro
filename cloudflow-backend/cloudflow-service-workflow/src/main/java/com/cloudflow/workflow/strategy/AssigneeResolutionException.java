package com.cloudflow.workflow.strategy;

import com.cloudflow.workflow.exception.WorkflowException;

public class AssigneeResolutionException extends WorkflowException {
    public AssigneeResolutionException(String message) {
        super("ASSIGNEE_RESOLUTION_FAILED", message);
    }
}

package com.cloudflow.workflow.domain.vo;

import java.util.List;

public record TaskSignatureContext(String taskId, String kind, String signType, Long assigneeId,
                                   boolean canAdd, boolean canReduce, String message, List<Member> members) {
    public record Member(Long userId, String userName, String status) { }
}

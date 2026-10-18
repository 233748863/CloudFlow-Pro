package com.cloudflow.workflow.domain.vo;

import java.util.List;
import java.util.Map;

public record StartAssigneeNodeVO(String nodeKey, String nodeName, Map<String, Object> selectableScope,
                                  boolean multiple, List<Candidate> candidates) {
    public record Candidate(String userId, String userName) {
    }
}

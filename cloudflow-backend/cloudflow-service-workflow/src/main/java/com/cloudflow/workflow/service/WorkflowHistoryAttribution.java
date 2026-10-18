package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfTaskHistory;

import java.util.Objects;
import java.util.Set;

public final class WorkflowHistoryAttribution {
    private static final Set<String> NON_COMPLETING_ACTIONS = Set.of("AGENT_ASSIST", "AGENT_RETURN");

    private WorkflowHistoryAttribution() {
    }

    public static Long owner(WfTaskHistory history) {
        return history.getOnBehalfOfUserId() == null ? history.getOperatorId() : history.getOnBehalfOfUserId();
    }

    public static boolean countsAsCompletion(WfTaskHistory history) {
        return history != null && owner(history) != null
                && !NON_COMPLETING_ACTIONS.contains(Objects.toString(history.getAction(), ""));
    }

    public static LambdaQueryWrapper<WfTaskHistory> completedHistory() {
        return new LambdaQueryWrapper<WfTaskHistory>().and(history -> history.isNull(WfTaskHistory::getAction)
                .or().notIn(WfTaskHistory::getAction, NON_COMPLETING_ACTIONS));
    }

    public static LambdaQueryWrapper<WfTaskHistory> forOwner(Long userId) {
        return completedHistory().and(history -> history.eq(WfTaskHistory::getOnBehalfOfUserId, userId)
                .or(original -> original.isNull(WfTaskHistory::getOnBehalfOfUserId).eq(WfTaskHistory::getOperatorId, userId)));
    }
}

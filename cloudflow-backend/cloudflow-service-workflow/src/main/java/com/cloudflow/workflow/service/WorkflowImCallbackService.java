package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WorkflowImCallbackMapper;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkflowImCallbackService {
    private final WorkflowImCallbackMapper mapper;
    private final WorkflowImCallbackGuard guard;
    private final WorkflowImButtonPolicy buttons;
    private final IWfTaskService tasks;

    public ImTaskCallbacks.Outcome execute(ImTaskCallbacks.Request request) {
        UserContext.clear(); TenantContext.clear();
        try {
            TenantContext.setTenantId(request.tenantId());
            UserContext.setTenantId(request.tenantId());
            if (mapper.history(request) != null) return completed();
            ImTaskCallbacks.Actor actor = guard.verify(request);
            UserContext.setUserId(actor.userId());
            UserContext.setUserName("im:" + actor.userId());
            UserContext.setRoles(Set.of());
            UserContext.setPermissions(Set.of("workflow:task:complete"));
            UserContext.setDsType(4); UserContext.setDsDeptIds(List.of());
            WorkflowImCompletionContext.Command command = new WorkflowImCompletionContext.Command(actor.tenantId(), actor.callbackId(),
                    actor.taskId(), actor.assignmentVersion(), actor.userId(), actor.action());
            R<?> result = WorkflowImCompletionContext.call(command, task -> { guard.require(actor); buttons.require(task); },
                    () -> tasks.completeTask(actor.taskId(), actor.action(), null, null, null));
            if (mapper.history(request) != null) return completed();
            return new ImTaskCallbacks.Outcome("RETRYABLE", result != null && result.isSuccess() ? "IM_HISTORY_PENDING" : "IM_TASK_RETRY");
        } catch (ServiceException failure) {
            if (mapper.history(request) != null) return completed();
            boolean rejected = Integer.valueOf(403).equals(failure.getCode()) || Integer.valueOf(409).equals(failure.getCode());
            return new ImTaskCallbacks.Outcome(rejected ? "REJECTED" : "RETRYABLE", rejected ? "IM_TASK_IDENTITY_CHANGED" : "IM_VERIFICATION_UNAVAILABLE");
        } catch (WorkflowException failure) {
            if (mapper.history(request) != null) return completed();
            boolean retry = Set.of("SYSTEM_BUSY", "RATE_LIMIT_EXCEEDED", "INVALID_STATE").contains(failure.getCode());
            return new ImTaskCallbacks.Outcome(retry ? "RETRYABLE" : "REJECTED",
                    "IM_TASK_DETAILS_REQUIRED".equals(failure.getCode()) ? "IM_TASK_DETAILS_REQUIRED" : retry ? "IM_TASK_RETRY" : "IM_TASK_RULE_REJECTED");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static ImTaskCallbacks.Outcome completed() { return new ImTaskCallbacks.Outcome("COMPLETED", "IM_TASK_COMPLETED"); }
}

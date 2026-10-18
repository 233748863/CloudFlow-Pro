package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.service.remote.ImTodoVerificationClient;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkflowImTodoService {
    private final WfTaskMapper tasks;
    private final WfTaskHistoryMapper history;
    private final WfProcessInstanceMapper instances;
    private final WorkflowFormAccessService forms;
    private final WorkflowImSummaryService summaries;
    private final WorkflowPermissionService permissions;
    private final WorkflowImButtonPolicy buttons;
    private final ImTodoVerificationClient verifier;

    public ImTaskTodos.Projection project(ImTaskTodos.Request request) {
        UserContext.clear(); TenantContext.clear();
        try {
            if (request == null) throw stale();
            UserContext.setTenantId(request.tenantId()); TenantContext.setTenantId(request.tenantId());
            ImTaskTodos.Actor actor = verify(request);
            UserContext.setUserId(actor.userId()); UserContext.setUserName("im:" + actor.userId());
            UserContext.setRoles(Set.of()); UserContext.setPermissions(actor.permissions());
            UserContext.setDsType(4); UserContext.setDsDeptIds(List.of());
            WfTask task = tasks.selectById(actor.taskId());
            if (task == null || !Objects.equals(task.getTenantId(), request.tenantId()) || !Objects.equals(task.getTaskId(), actor.taskId())) {
                return ImTaskTodos.Projection.terminal(request, task == null ? historicalState(actor) : "CANCELLED");
            }
            if (!"TODO".equals(task.getStatus())) {
                return ImTaskTodos.Projection.terminal(request, Set.of("APPROVED", "REJECTED", "COMPLETED").contains(Objects.toString(task.getStatus(), "")) ? "COMPLETED" : "CANCELLED");
            }
            if (!Objects.equals(task.getVersion(), actor.assignmentVersion())) return ImTaskTodos.Projection.terminal(request, "CANCELLED");
            if (!Objects.equals(task.getAssignee(), actor.userId()) && !Objects.equals(task.getProxyUserId(), actor.userId())) throw stale();
            WfProcessInstance instance = instances.selectById(task.getInstanceId());
            if (instance == null || !Objects.equals(instance.getTenantId(), request.tenantId()) || !"RUNNING".equals(instance.getStatus())) {
                return ImTaskTodos.Projection.terminal(request, "CANCELLED");
            }
            permissions.checkTaskReadPermission(task);
            WorkflowFormAccessService.ReadContext context = forms.instance(instance.getInstanceId(), task.getTaskId());
            boolean direct = direct(task, actor);
            List<ImTaskTodos.Field> fields = summaries.forTask(task.getTaskId()).stream()
                    .map(field -> new ImTaskTodos.Field(field.label(), field.value())).toList();
            WfTask current = tasks.selectById(actor.taskId());
            if (current == null || !Objects.equals(current.getTenantId(), task.getTenantId()) || !Objects.equals(current.getVersion(), task.getVersion())
                    || !"TODO".equals(current.getStatus()) || !Objects.equals(current.getAssignee(), task.getAssignee())
                    || !Objects.equals(current.getProxyUserId(), task.getProxyUserId()) || !actor.equals(verify(request))) throw stale();
            return new ImTaskTodos.Projection(request, "ACTIVE", instance.getInstanceId(),
                    title(context.definition().getProcessName(), "待处理流程"), title(instance.getStartUserName(), "流程发起人"), direct, fields);
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    public ImTaskTodos.Status status(ImTaskTodos.Request request) {
        UserContext.clear(); TenantContext.clear();
        try {
            if (request == null) throw stale();
            UserContext.setTenantId(request.tenantId()); TenantContext.setTenantId(request.tenantId());
            ImTaskTodos.Actor actor = verify(request);
            UserContext.setUserId(actor.userId()); UserContext.setUserName("im:" + actor.userId());
            UserContext.setRoles(Set.of()); UserContext.setPermissions(actor.permissions());
            UserContext.setDsType(4); UserContext.setDsDeptIds(List.of());
            String state = currentState(actor);
            if (!actor.equals(verify(request)) || !state.equals(currentState(actor))) throw stale();
            return new ImTaskTodos.Status(request, state);
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private String currentState(ImTaskTodos.Actor actor) {
        WfTask task = tasks.selectById(actor.taskId());
        if (task == null) return historicalState(actor);
        if (!Objects.equals(task.getTenantId(), actor.request().tenantId())) return "CANCELLED";
        if (!"TODO".equals(task.getStatus())) {
            return Set.of("APPROVED", "REJECTED", "COMPLETED").contains(Objects.toString(task.getStatus(), "")) ? "COMPLETED" : "CANCELLED";
        }
        if (!Objects.equals(task.getVersion(), actor.assignmentVersion())
                || !Objects.equals(task.getAssignee(), actor.userId()) && !Objects.equals(task.getProxyUserId(), actor.userId())) return "CANCELLED";
        WfProcessInstance instance = instances.selectById(task.getInstanceId());
        if (instance == null || !Objects.equals(instance.getTenantId(), actor.request().tenantId()) || !"RUNNING".equals(instance.getStatus())) return "CANCELLED";
        permissions.checkTaskReadPermission(task);
        return "ACTIVE";
    }

    private String historicalState(ImTaskTodos.Actor actor) {
        String action = history.selectLatestTaskAction(actor.request().tenantId(), actor.taskId());
        return Set.of("APPROVE", "REJECT", "COUNTERSIGN_APPROVE", "COUNTERSIGN_REJECT").contains(Objects.toString(action, ""))
                ? "COMPLETED" : "CANCELLED";
    }

    private boolean direct(WfTask task, ImTaskTodos.Actor actor) {
        if (!actor.permissions().contains("workflow:task:complete")) return false;
        try { permissions.checkTaskPermission(task); buttons.require(task); return true; }
        catch (PermissionDeniedException denied) { return false; }
        catch (WorkflowException rejected) {
            if (Set.of("IM_TASK_DETAILS_REQUIRED", "AGENT_FORBIDDEN").contains(rejected.getCode())) return false;
            throw rejected;
        }
    }

    private ImTaskTodos.Actor verify(ImTaskTodos.Request request) {
        R<ImTaskTodos.Actor> response = verifier.verify(request);
        if (response == null || !response.isSuccess() || response.getData() == null) {
            int code = response != null && (response.getCode() == 403 || response.getCode() == 409) ? response.getCode() : 503;
            throw new ServiceException("企业通信待办接收人核验失败", code);
        }
        if (!request.equals(response.getData().request())) throw stale();
        return response.getData();
    }

    private String title(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        String cleaned = value.replaceAll("[\\p{Cc}\\p{Cf}]", " ").strip();
        return cleaned.isBlank() ? fallback : cleaned;
    }

    private static ServiceException stale() { return new ServiceException("企业通信待办接收人或任务已变化", 409); }
}

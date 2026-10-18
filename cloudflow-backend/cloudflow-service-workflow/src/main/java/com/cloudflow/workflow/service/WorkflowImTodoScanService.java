package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WorkflowImTodoScanMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkflowImTodoScanService {
    private final WorkflowImTodoScanMapper mapper;
    private final WorkflowAgentService agents;

    public ImTaskTodos.Page scan(ImTaskTodos.Scan request) {
        UserContext.clear(); TenantContext.clear();
        try {
            if (request == null) throw new IllegalArgumentException("待办扫描请求缺失");
            List<WfTask> tasks = TenantBroker.applyWithoutTenant(ignored -> mapper.pending(request.afterTaskId()));
            List<ImTaskTodos.Candidate> candidates = new ArrayList<>();
            for (WfTask task : tasks) {
                if (task.getTenantId() == null || task.getTenantId() <= 0 || task.getAssignee() == null || task.getAssignee() <= 0
                        || task.getVersion() == null || task.getVersion() < 0) continue;
                UserContext.setTenantId(task.getTenantId()); TenantContext.setTenantId(task.getTenantId());
                List<Long> receivers = new ArrayList<>(); receivers.add(task.getAssignee());
                if (task.getProxyUserId() != null && !Objects.equals(task.getProxyUserId(), task.getAssignee())
                        && agents.canRead(task, task.getProxyUserId())) receivers.add(task.getProxyUserId());
                candidates.add(new ImTaskTodos.Candidate(task.getTenantId(), task.getTaskId(), task.getVersion(), receivers));
            }
            return new ImTaskTodos.Page(tasks.size() == 100 ? tasks.get(tasks.size() - 1).getTaskId() : null, candidates);
        } finally { UserContext.clear(); TenantContext.clear(); }
    }
}

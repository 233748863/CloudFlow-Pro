package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.metadata.OrderItem;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import com.cloudflow.common.core.search.BusinessSearchQuery;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.common.core.search.BusinessSearchType;
import com.cloudflow.common.security.search.BusinessSearchAccess;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WorkflowBusinessSearchMapper;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkflowBusinessSearchService {
    private final WorkflowBusinessSearchMapper mapper;
    private final WorkflowPermissionService permissions;
    private final WorkflowAgentService agents;

    public List<BusinessSearchGroup> search(BusinessSearchQuery query) {
        BusinessSearchAccess.requireContext();
        BusinessSearchType type = BusinessSearchType.WORKFLOW_INSTANCE;
        if (!BusinessSearchAccess.allowed(type)) return List.of(BusinessSearchGroup.forbidden(type));
        Long tenantId = UserContext.getTenantId();
        Long userId = UserContext.getUserId();
        boolean admin = permissions.isAdmin(userId);
        Set<String> agentInstances = new HashSet<>();
        if (!admin) {
            for (WfTask task : mapper.proxyTasks(tenantId, userId, query.pattern())) {
                if (agents.canRead(task, userId)) agentInstances.add(task.getInstanceId());
            }
        }
        Page<BusinessSearchRow> page = new Page<BusinessSearchRow>(1, query.limitPerType() + 1, false)
                .addOrder(OrderItem.desc("id"));
        List<BusinessSearchRow> rows = mapper.instances(page, tenantId, userId, query.pattern(), admin, agentInstances).getRecords();
        return List.of(BusinessSearchGroup.available(type, rows, query.limitPerType()));
    }
}

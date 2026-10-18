package com.cloudflow.workflow.service;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.security.report.ReportAccess;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WorkflowReportMapper;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WorkflowReportService {
    private final WorkflowReportMapper mapper;
    private final WorkflowPermissionService permissions;
    private final WorkflowAgentService agents;

    public ReportResult query(String code, ReportQuery input) {
        ReportDataset dataset = ReportRegistry.require(code);
        ReportAccess.requireDataset(dataset);
        PreparedReportQuery query = ReportValidation.prepare(dataset, input, LocalDate.now());
        Long tenantId = UserContext.getTenantId();
        Long userId = UserContext.getUserId();
        boolean admin = permissions.isAdmin(userId);
        Set<String> agentInstances = new HashSet<>();
        Set<String> agentTasks = new HashSet<>();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        if (!admin) {
            for (WfTask task : mapper.proxyTasks(tenantId, userId, query, "WF_INSTANCE".equals(code))) {
                if (System.nanoTime() > deadline) throw new ServiceException("报表权限查询超过5秒，请缩小日期范围", 504);
                if (agents.canRead(task, userId)) {
                    agentTasks.add(task.getTaskId());
                    agentInstances.add(task.getInstanceId());
                }
            }
        }
        List<ReportRow> rows = switch (code) {
            case "WF_INSTANCE" -> mapper.instances(tenantId, userId, admin, agentInstances, query);
            case "WF_TASK" -> mapper.tasks(tenantId, userId, admin, agentTasks,
                    StpUtil.hasPermission("workflow:task:todo"), StpUtil.hasPermission("workflow:task:done"), query);
            default -> throw ReportValidation.invalid("该服务不提供此数据集");
        };
        return ReportResult.from(dataset, query, rows);
    }
}

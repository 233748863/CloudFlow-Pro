package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaActivityCost;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.OaTimesheet;
import com.cloudflow.oa.domain.OaTimesheetDetail;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class OaProjectAuditService {
    private final SysAuditLogMapper mapper;
    private final ObjectMapper json;

    public enum Action {
        COST_CONFIGURED("保存工时成本和计费单价"),
        TIMESHEET_SUBMITTED("提交工时审批"),
        TIMESHEET_APPROVED("工时审批通过"),
        TIMESHEET_REJECTED("工时审批驳回"),
        PROJECT_RECALCULATED("重算项目工时与成本"),
        PROJECTS_RECALCULATED("全量重算项目成本");

        private final String title;

        Action(String title) {
            this.title = title;
        }
    }

    public record Snapshot(Long tenantId, String businessType, Long businessId, String businessNo, JsonNode values) { }

    private record Approval(String processInstanceId, String result, Long approverId, String approverName,
                            Long approvalTime) { }

    private record Entry(String action, String businessType, Long businessId, String businessNo,
                         Long operatorId, String operatorName, Long executorId, Approval approval,
                         JobInvocationContext.Execution job, JsonNode state, Map<String, ?> details) { }

    public Snapshot absentCost() {
        return snapshot(OaRecordSupport.tenantId(), "OA_ACTIVITY_COST", null, null, null);
    }

    public Snapshot cost(OaActivityCost cost) {
        return snapshot(cost.getTenantId(), "OA_ACTIVITY_COST", cost.getCostId(), String.valueOf(cost.getCostId()), cost);
    }

    public Snapshot timesheet(OaTimesheet sheet, List<OaTimesheetDetail> details) {
        return snapshot(sheet.getTenantId(), "OA_TIMESHEET", sheet.getTimesheetId(), sheet.getTimesheetNo(),
                Map.of("timesheet", sheet, "details", details));
    }

    public Snapshot project(OaProject project, List<OaProjectTask> tasks) {
        return snapshot(project.getTenantId(), "OA_PROJECT", project.getProjectId(), project.getProjectNo(),
                Map.of("project", project, "tasks", tasks));
    }

    public Snapshot batch(String executionNo, String status, List<Long> projectIds, List<Long> failedProjectIds) {
        return snapshot(OaRecordSupport.tenantId(), "OA_PROJECT_COST_BATCH", null, executionNo,
                Map.of("status", status, "projectIds", projectIds, "failedProjectIds", failedProjectIds));
    }

    private Snapshot snapshot(Long tenantId, String businessType, Long businessId, String businessNo, Object values) {
        OaRecordSupport.same(OaRecordSupport.tenantId(), tenantId, "项目工时审计归属不一致");
        return new Snapshot(tenantId, businessType, businessId, businessNo, json.valueToTree(values));
    }

    @Transactional(propagation = Propagation.MANDATORY, rollbackFor = Exception.class)
    public void record(Action action, Snapshot before, Snapshot after, Map<String, ?> details, ApprovalResultDTO decision) {
        write(action, before, after, details, decision);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void recordBatch(Snapshot before, Snapshot after) {
        write(Action.PROJECTS_RECALCULATED, before, after, Map.of(), null);
    }

    private void write(Action action, Snapshot before, Snapshot after, Map<String, ?> details, ApprovalResultDTO decision) {
        Long tenantId = OaRecordSupport.tenantId();
        OaRecordSupport.same(tenantId, before.tenantId(), "项目工时审计归属不一致");
        OaRecordSupport.same(tenantId, after.tenantId(), "项目工时审计归属不一致");
        OaRecordSupport.same(before.businessType(), after.businessType(), "项目工时审计类型不一致");
        if (before.businessId() != null || !"OA_ACTIVITY_COST".equals(before.businessType())) {
            OaRecordSupport.same(before.businessId(), after.businessId(), "项目工时审计编号不一致");
        }
        if (before.businessNo() != null) OaRecordSupport.same(before.businessNo(), after.businessNo(), "项目工时审计单号不一致");
        if (decision != null) {
            OaRecordSupport.same(tenantId, decision.getTenantId(), "工时审批审计归属不一致");
            if (!Objects.equals(String.valueOf(after.businessId()), String.valueOf(decision.getBusinessId()))) {
                throw new IllegalArgumentException("工时审批审计业务编号不一致");
            }
        }
        boolean hasApprover = decision != null && decision.getApproverId() != null;
        Long operatorId = hasApprover ? decision.getApproverId() : UserContext.getUserId();
        String operatorName = hasApprover ? decision.getApproverName() : OaRecordSupport.userName();
        if (operatorName == null || operatorName.isBlank()) operatorName = operatorId == null ? "system" : operatorId.toString();
        Approval approval = decision == null ? null : new Approval(decision.getProcessInstanceId(), decision.getApprovalResult(),
                decision.getApproverId(), decision.getApproverName(), decision.getApprovalTime());
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(tenantId);
        audit.setBizModule("oa");
        audit.setAuditName(action.title);
        audit.setAuditField(action.name());
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(operatorName.length() <= 64 ? operatorName : String.valueOf(operatorId));
        audit.setCreateTime(LocalDateTime.now());
        try {
            audit.setBeforeJson(json.writeValueAsString(new Entry(action.name(), after.businessType(), after.businessId(),
                    after.businessNo(), operatorId, operatorName, UserContext.getUserId(), approval,
                    JobInvocationContext.execution(), before.values(), details)));
            audit.setAfterJson(json.writeValueAsString(new Entry(action.name(), after.businessType(), after.businessId(),
                    after.businessNo(), operatorId, operatorName, UserContext.getUserId(), approval,
                    JobInvocationContext.execution(), after.values(), details)));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("项目工时审计快照保存失败", exception);
        }
        OaRecordSupport.saved(mapper.insert(audit));
    }
}

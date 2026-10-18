package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.vo.OaProjectFinancialTotals;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaProjectTaskMapper;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaTimesheetQueryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OaProjectAccountingService {
    private final OaProjectMapper projects;
    private final OaProjectTaskMapper tasks;
    private final OaContractMapper contracts;
    private final OaTimesheetQueryMapper query;
    private final PlatformTransactionManager transactionManager;
    private final OaProjectAuditService audit;

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void recalculate(Long projectId) {
        recalculate(projectId, false);
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void recalculateRequested(Long projectId) {
        recalculate(projectId, true);
    }

    private void recalculate(Long projectId, boolean requested) {
        OaProject project = OaRecordSupport.active(projects.selectForUpdate(projectId, OaRecordSupport.tenantId()));
        List<OaProjectTask> projectTasks = tasks.selectList(new LambdaQueryWrapper<OaProjectTask>().eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                .eq(OaProjectTask::getProjectId, projectId).eq(OaProjectTask::getDeleted, 0));
        OaProjectAuditService.Snapshot before = audit.project(project, projectTasks);
        BigDecimal openingHours = projectTasks.stream().map(task -> OaRecordSupport.zero(task.getOpeningActualHours())).reduce(BigDecimal.ZERO, BigDecimal::add);
        OaProjectFinancialTotals totals = query.totals(OaRecordSupport.tenantId(), projectId);
        BigDecimal laborAmount = money(totals.getLaborCostAmount());
        BigDecimal billableAmount = money(totals.getBillableAmount());
        BigDecimal purchaseAmount = money(totals.getPurchaseCostAmount());
        BigDecimal billedAmount = money(totals.getBilledAmount());
        BigDecimal actualHours = OaRecordSupport.decimal(openingHours.add(OaRecordSupport.zero(totals.getActualHours())), 10, 2, false, "项目实际工时");
        BigDecimal actualCost = money(laborAmount.add(purchaseAmount).add(OaRecordSupport.zero(project.getOtherCostAmount())));
        BigDecimal grossMargin = OaRecordSupport.decimal(billableAmount.subtract(actualCost), 18, 2, true, "项目毛利");
        BigDecimal marginRate = billableAmount.signum() == 0 ? null
                : OaRecordSupport.decimal(grossMargin.divide(billableAmount, 4, RoundingMode.HALF_UP), 6, 4, true, "项目毛利率");
        boolean changed = !sameAmount(project.getLaborCostAmount(), laborAmount) || !sameAmount(project.getBillableAmount(), billableAmount)
                || !sameAmount(project.getPurchaseCostAmount(), purchaseAmount) || !sameAmount(project.getBilledAmount(), billedAmount)
                || !sameAmount(project.getActualHours(), actualHours) || !sameAmount(project.getActualCostAmount(), actualCost)
                || !sameAmount(project.getGrossMargin(), grossMargin) || !sameAmount(project.getGrossMarginRate(), marginRate);
        if (changed) {
            OaRecordSupport.touch(project);
            OaRecordSupport.saved(projects.update(null, new LambdaUpdateWrapper<OaProject>()
                    .eq(OaProject::getProjectId, projectId).eq(OaProject::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaProject::getDeleted, 0).eq(OaProject::getVersion, project.getVersion())
                    .set(OaProject::getLaborCostAmount, laborAmount).set(OaProject::getBillableAmount, billableAmount)
                    .set(OaProject::getPurchaseCostAmount, purchaseAmount).set(OaProject::getBilledAmount, billedAmount)
                    .set(OaProject::getActualHours, actualHours).set(OaProject::getActualCostAmount, actualCost)
                    .set(OaProject::getGrossMargin, grossMargin).set(OaProject::getGrossMarginRate, marginRate)
                    .set(OaProject::getVersion, project.getVersion() + 1).set(OaProject::getUpdateBy, project.getUpdateBy())
                    .set(OaProject::getUpdateTime, project.getUpdateTime())));
        }
        projectTasks.sort(Comparator.comparingInt((OaProjectTask task) -> task.getLevelPath().length()).reversed());
        for (OaProjectTask task : projectTasks) {
            BigDecimal taskHours = OaRecordSupport.zero(task.getOpeningActualHours())
                    .add(OaRecordSupport.zero(query.taskHours(OaRecordSupport.tenantId(), task.getTaskId())));
            if (Integer.valueOf(1).equals(task.getIsGroupFlag())) taskHours = projectTasks.stream()
                    .filter(child -> Objects.equals(child.getParentTaskId(), task.getTaskId()))
                    .map(OaProjectTask::getActualHours).reduce(taskHours, BigDecimal::add);
            taskHours = OaRecordSupport.decimal(taskHours, 10, 2, false, "任务实际工时");
            if (sameAmount(task.getActualHours(), taskHours)) continue;
            changed = true;
            task.setActualHours(taskHours);
            OaRecordSupport.touch(task);
            OaRecordSupport.saved(tasks.update(null, new LambdaUpdateWrapper<OaProjectTask>()
                    .eq(OaProjectTask::getTaskId, task.getTaskId()).eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaProjectTask::getDeleted, 0).eq(OaProjectTask::getVersion, task.getVersion())
                    .set(OaProjectTask::getActualHours, taskHours).set(OaProjectTask::getVersion, task.getVersion() + 1)
                    .set(OaProjectTask::getUpdateBy, task.getUpdateBy()).set(OaProjectTask::getUpdateTime, task.getUpdateTime())));
        }
        if (changed || requested) {
            OaProject current = OaRecordSupport.active(projects.selectById(projectId));
            List<OaProjectTask> currentTasks = tasks.selectList(new LambdaQueryWrapper<OaProjectTask>()
                    .eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId()).eq(OaProjectTask::getProjectId, projectId)
                    .eq(OaProjectTask::getDeleted, 0).orderByAsc(OaProjectTask::getTaskId));
            audit.record(OaProjectAuditService.Action.PROJECT_RECALCULATED, before, audit.project(current, currentTasks),
                    Map.of("requested", requested, "changed", changed), null);
        }
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void refreshContract(Long contractId) {
        if (contractId == null) return;
        OaContract contract = OaRecordSupport.active(contracts.selectById(contractId));
        if (contract.getProjectId() != null) recalculate(contract.getProjectId());
    }

    public int recalculateAll() {
        List<OaProject> records = projects.selectList(new LambdaQueryWrapper<OaProject>().eq(OaProject::getTenantId, OaRecordSupport.tenantId()).eq(OaProject::getDeleted, 0).orderByAsc(OaProject::getProjectId));
        List<Long> projectIds = records.stream().map(OaProject::getProjectId).toList();
        List<Long> failedProjectIds = new ArrayList<>();
        String executionNo = UUID.randomUUID().toString();
        OaProjectAuditService.Snapshot before = audit.batch(executionNo, "PENDING", projectIds, List.of());
        List<RuntimeException> failures = new ArrayList<>();
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        for (OaProject project : records) {
            try {
                transaction.executeWithoutResult(status -> recalculate(project.getProjectId()));
            } catch (RuntimeException exception) {
                failedProjectIds.add(project.getProjectId());
                failures.add(new IllegalStateException("项目重算失败，项目：" + project.getProjectId(), exception));
            }
        }
        audit.recordBatch(before, audit.batch(executionNo, failures.isEmpty() ? "COMPLETED" : "PARTIAL_FAILURE", projectIds, failedProjectIds));
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("项目成本重算存在失败项目：" + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return records.size();
    }

    private boolean sameAmount(BigDecimal previous, BigDecimal current) {
        return previous == null ? current == null : current != null && previous.compareTo(current) == 0;
    }

    private BigDecimal money(BigDecimal amount) { return OaRecordSupport.decimal(amount, 18, 2, false, "项目金额"); }
}

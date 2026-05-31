package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaBudgetPlan;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectMember;
import com.cloudflow.oa.domain.OaProjectMilestone;
import com.cloudflow.oa.domain.OaProjectRisk;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.domain.vo.ProjectCostSummaryVO;
import com.cloudflow.oa.domain.vo.ProjectDetailVO;
import com.cloudflow.oa.domain.vo.ProjectKpiVO;
import com.cloudflow.oa.domain.vo.ProjectLinkSummaryVO;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.mapper.OaBudgetPlanMapper;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaInvoiceMapper;
import com.cloudflow.oa.mapper.OaProjectDependencyMapper;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaProjectMemberMapper;
import com.cloudflow.oa.mapper.OaProjectMilestoneMapper;
import com.cloudflow.oa.mapper.OaProjectRiskMapper;
import com.cloudflow.oa.service.IOaProjectService;
import com.cloudflow.oa.service.IWorkTaskService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaProjectServiceImpl extends ServiceImpl<OaProjectMapper, OaProject> implements IOaProjectService {

    private final RemoteWorkflowService remoteWorkflowService;
    private final OaWorkflowFailureHelper workflowFailureHelper;
    private final OaProjectMemberMapper projectMemberMapper;
    private final OaProjectMilestoneMapper projectMilestoneMapper;
    private final OaProjectRiskMapper projectRiskMapper;
    private final OaProjectDependencyMapper projectDependencyMapper;
    private final IWorkTaskService workTaskService;
    private final OaBudgetPlanMapper budgetPlanMapper;
    private final OaInvoiceMapper invoiceMapper;
    private final OaContractMapper contractMapper;
    private final BizExpenseClaimMapper expenseClaimMapper;
    private final BizPurchaseRequestMapper purchaseRequestMapper;
    private final BizPaymentRequestMapper paymentRequestMapper;

    @Override
    public PageResult<OaProject> queryPage(OaProject query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaProject> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaProject::getDeleted, "0").orderByDesc(OaProject::getUpdateTime);
        if (StringUtils.hasText(query.getProjectName())) {
            wrapper.like(OaProject::getProjectName, query.getProjectName());
        }
        if (query.getCustomerId() != null) {
            wrapper.eq(OaProject::getCustomerId, query.getCustomerId());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(OaProject::getStatus, query.getStatus());
        }
        return PageResult.build(page(pageQuery.build(), wrapper));
    }

    @Override
    public Long createProject(OaProject project) {
        validate(project);
        OaProject existed = findExistingSourceProject(project);
        if (existed != null) {
            return existed.getProjectId();
        }
        LocalDateTime now = LocalDateTime.now();
        project.setTenantId(resolveTenantId());
        project.setProjectNo(StringUtils.hasText(project.getProjectNo()) ? project.getProjectNo()
                : "PRJ" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        project.setStatus(StringUtils.hasText(project.getStatus()) ? project.getStatus() : "DRAFT");
        project.setProgress(project.getProgress() == null ? BigDecimal.ZERO : project.getProgress());
        project.setActualCostAmount(project.getActualCostAmount() == null ? BigDecimal.ZERO : project.getActualCostAmount());
        project.setOwnerId(project.getOwnerId() == null ? UserContext.getUserId() : project.getOwnerId());
        project.setOwnerName(StringUtils.hasText(project.getOwnerName()) ? project.getOwnerName() : resolveUserName());
        project.setDeptId(project.getDeptId() == null ? UserContext.getDeptId() : project.getDeptId());
        project.setDeptName(StringUtils.hasText(project.getDeptName()) ? project.getDeptName() : UserContext.getDeptName());
        project.setRiskLevel(StringUtils.hasText(project.getRiskLevel()) ? project.getRiskLevel() : "LOW");
        project.setSourceName(StringUtils.hasText(project.getSourceName()) ? project.getSourceName() : resolveSourceName(project));
        project.setBaselineVersion(project.getBaselineVersion() == null ? 0 : project.getBaselineVersion());
        project.setCreateBy(UserContext.getUserName());
        project.setCreateTime(now);
        project.setUpdateBy(UserContext.getUserName());
        project.setUpdateTime(now);
        project.setDeleted(0);
        boolean saved = save(project);
        if (!saved || project.getProjectId() == null) {
            throw new IllegalArgumentException("项目创建失败");
        }
        return project.getProjectId();
    }

    @Override
    @Audit(name = "更新项目")
    public boolean updateProject(OaProject project) {
        if (project == null || project.getProjectId() == null) {
            throw new IllegalArgumentException("项目ID不能为空");
        }
        validate(project);
        OaProject persisted = requireProject(project.getProjectId());
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(persisted, OaProject::getOwnerId, "项目");
        project.setTenantId(persisted.getTenantId());
        project.setProjectNo(StringUtils.hasText(project.getProjectNo()) ? project.getProjectNo() : persisted.getProjectNo());
        project.setInstanceId(persisted.getInstanceId());
        project.setStatus(StringUtils.hasText(project.getStatus()) ? project.getStatus() : persisted.getStatus());
        project.setActualCostAmount(project.getActualCostAmount() == null ? persisted.getActualCostAmount() : project.getActualCostAmount());
        project.setOwnerId(project.getOwnerId() == null ? persisted.getOwnerId() : project.getOwnerId());
        project.setOwnerName(StringUtils.hasText(project.getOwnerName()) ? project.getOwnerName() : persisted.getOwnerName());
        project.setDeptId(project.getDeptId() == null ? persisted.getDeptId() : project.getDeptId());
        project.setDeptName(StringUtils.hasText(project.getDeptName()) ? project.getDeptName() : persisted.getDeptName());
        project.setRiskLevel(StringUtils.hasText(project.getRiskLevel()) ? project.getRiskLevel() : persisted.getRiskLevel());
        project.setSourceName(StringUtils.hasText(project.getSourceName()) ? project.getSourceName() : persisted.getSourceName());
        project.setBaselineVersion(project.getBaselineVersion() == null ? persisted.getBaselineVersion() : project.getBaselineVersion());
        project.setUpdateBy(UserContext.getUserName());
        project.setUpdateTime(LocalDateTime.now());
        return updateById(project);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitProject(Long projectId) {
        OaProject project = requireProject(projectId);
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(project, OaProject::getOwnerId, "项目");
        if (!"DRAFT".equals(project.getStatus()) && !"REJECTED".equals(project.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回项目可以提交立项");
        }
        project.setStatus("PENDING");
        project.setUpdateBy(UserContext.getUserName());
        project.setUpdateTime(LocalDateTime.now());
        try {
            WorkflowProcessStartDTO dto = new WorkflowProcessStartDTO();
            dto.setProcessDefKey("project_approval");
            dto.setBusinessKey("PROJECT:" + projectId);
            Map<String, Object> variables = new HashMap<>();
            variables.put("projectId", projectId);
            variables.put("projectNo", project.getProjectNo());
            variables.put("projectName", project.getProjectName());
            variables.put("budgetAmount", project.getBudgetAmount());
            variables.put("customerName", project.getCustomerName());
            variables.put("ownerName", project.getOwnerName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.PROJECT,
                    projectId,
                    project.getProjectNo(),
                    "workflow:stream:approval-callback:oa"
            );
            dto.setVariables(variables);
            var result = remoteWorkflowService.startProcess(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                project.setInstanceId(extractInstanceId(result.getData()));
            }
        } catch (Exception e) {
            log.error("项目 {} 启动工作流失败: {}", project.getProjectNo(), e.getMessage(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.PROJECT, projectId, project.getProjectNo(),
                    project.getOwnerName(), project.getOwnerId(), e);
        }
        boolean updated = updateById(project);
        if (updated) {
            if ((project.getBaselineVersion() == null || project.getBaselineVersion() <= 0)) {
                snapshotBaseline(projectId);
            }
            refreshProjectActualCost(projectId);
            syncProjectRiskLevel(projectId);
        }
        return updated;
    }

    @Override
    public ProjectDetailVO getProjectDetail(Long projectId) {
        OaProject project = requireProject(projectId);
        refreshProjectActualCost(projectId);
        syncProjectRiskLevel(projectId);
        ProjectDetailVO detail = new ProjectDetailVO();
        detail.setProject(getById(projectId));
        detail.setMembers(listMembers(projectId));
        detail.setMilestones(listMilestones(projectId));
        detail.setWbsTasks(listWbsTasks(projectId));
        detail.setDependencies(listDependencies(projectId));
        detail.setRisks(listRisks(projectId));
        detail.setCostSummary(getCostSummary(projectId));
        detail.setKpi(buildProjectKpi(projectId));
        detail.setLinkSummary(buildProjectLinkSummary(project));
        detail.setBaselineVersion(detail.getProject() == null ? 0 : defaultInt(detail.getProject().getBaselineVersion()));
        return detail;
    }

    @Override
    public List<OaProjectMember> listMembers(Long projectId) {
        requireProject(projectId);
        return projectMemberMapper.selectList(new LambdaQueryWrapper<OaProjectMember>()
                .eq(OaProjectMember::getProjectId, projectId)
                .eq(OaProjectMember::getDeleted, "0")
                .orderByAsc(OaProjectMember::getJoinDate)
                .orderByAsc(OaProjectMember::getId));
    }

    @Override
    public List<OaProjectMilestone> listMilestones(Long projectId) {
        requireProject(projectId);
        return projectMilestoneMapper.selectList(new LambdaQueryWrapper<OaProjectMilestone>()
                .eq(OaProjectMilestone::getProjectId, projectId)
                .eq(OaProjectMilestone::getDeleted, "0")
                .orderByAsc(OaProjectMilestone::getSortOrder)
                .orderByAsc(OaProjectMilestone::getPlannedDate)
                .orderByAsc(OaProjectMilestone::getMilestoneId));
    }

    @Override
    public List<WorkTask> listWbsTasks(Long projectId) {
        requireProject(projectId);
        return workTaskService.listProjectTasks(projectId);
    }

    @Override
    public List<OaProjectDependency> listDependencies(Long projectId) {
        requireProject(projectId);
        return projectDependencyMapper.selectList(new LambdaQueryWrapper<OaProjectDependency>()
                .eq(OaProjectDependency::getProjectId, projectId)
                .eq(OaProjectDependency::getDeleted, "0")
                .orderByAsc(OaProjectDependency::getDependencyId));
    }

    @Override
    public List<OaProjectRisk> listRisks(Long projectId) {
        requireProject(projectId);
        List<OaProjectRisk> risks = new ArrayList<>(projectRiskMapper.selectList(new LambdaQueryWrapper<OaProjectRisk>()
                .eq(OaProjectRisk::getProjectId, projectId)
                .eq(OaProjectRisk::getDeleted, "0")
                .orderByDesc(OaProjectRisk::getCreateTime)
                .orderByDesc(OaProjectRisk::getRiskId)));
        appendMilestoneOverdueRisks(projectId, risks);
        return risks;
    }

    @Override
    public ProjectCostSummaryVO getCostSummary(Long projectId) {
        requireProject(projectId);
        ProjectCostSummaryVO summary = new ProjectCostSummaryVO();
        summary.setProjectId(projectId);
        summary.setExpenseAmount(sumExpenseAmount(projectId));
        summary.setPurchaseAmount(sumPurchaseAmount(projectId));
        summary.setPaymentAmount(sumPaymentAmount(projectId));
        summary.setTotalAmount(summary.getExpenseAmount()
                .add(summary.getPurchaseAmount())
                .add(summary.getPaymentAmount()));
        return summary;
    }

    @Override
    public boolean addMember(OaProjectMember member) {
        if (member == null || member.getProjectId() == null || member.getUserId() == null) {
            throw new IllegalArgumentException("项目成员信息不完整");
        }
        requireProject(member.getProjectId());
        LocalDateTime now = LocalDateTime.now();
        member.setTenantId(resolveTenantId());
        member.setUserName(StringUtils.hasText(member.getUserName()) ? member.getUserName() : resolveUserName());
        member.setRoleCode(StringUtils.hasText(member.getRoleCode()) ? member.getRoleCode() : "MEMBER");
        member.setRoleName(StringUtils.hasText(member.getRoleName()) ? member.getRoleName() : "项目成员");
        member.setBillableFlag(member.getBillableFlag() == null ? 1 : member.getBillableFlag());
        member.setDeleted(0);
        member.setCreateBy(resolveUserName());
        member.setCreateTime(now);
        member.setUpdateBy(resolveUserName());
        member.setUpdateTime(now);
        return projectMemberMapper.insert(member) > 0;
    }

    @Override
    @Audit(name = "更新项目成员")
    public boolean updateMember(OaProjectMember member) {
        if (member == null || member.getId() == null || member.getProjectId() == null) {
            throw new IllegalArgumentException("项目成员ID不能为空");
        }
        requireProject(member.getProjectId());
        member.setUpdateBy(resolveUserName());
        member.setUpdateTime(LocalDateTime.now());
        return projectMemberMapper.updateById(member) > 0;
    }

    @Override
    public boolean removeMembers(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LambdaUpdateWrapper<OaProjectMember> wrapper = new LambdaUpdateWrapper<>();
        wrapper.in(OaProjectMember::getId, ids)
                .set(OaProjectMember::getDeleted, "1")
                .set(OaProjectMember::getUpdateBy, resolveUserName())
                .set(OaProjectMember::getUpdateTime, LocalDateTime.now());
        return projectMemberMapper.update(null, wrapper) > 0;
    }

    @Override
    public boolean addMilestone(OaProjectMilestone milestone) {
        if (milestone == null || milestone.getProjectId() == null || !StringUtils.hasText(milestone.getMilestoneName())) {
            throw new IllegalArgumentException("项目里程碑信息不完整");
        }
        requireProject(milestone.getProjectId());
        LocalDateTime now = LocalDateTime.now();
        milestone.setTenantId(resolveTenantId());
        milestone.setMilestoneCode(StringUtils.hasText(milestone.getMilestoneCode())
                ? milestone.getMilestoneCode()
                : "MS" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        milestone.setOwnerId(milestone.getOwnerId() == null ? UserContext.getUserId() : milestone.getOwnerId());
        milestone.setOwnerName(StringUtils.hasText(milestone.getOwnerName()) ? milestone.getOwnerName() : resolveUserName());
        milestone.setProgress(milestone.getProgress() == null ? BigDecimal.ZERO : milestone.getProgress());
        milestone.setBaselineDate(milestone.getBaselineDate() == null ? milestone.getPlannedDate() : milestone.getBaselineDate());
        milestone.setSortOrder(milestone.getSortOrder() == null ? nextMilestoneSortOrder(milestone.getProjectId()) : milestone.getSortOrder());
        milestone.setStatus(StringUtils.hasText(milestone.getStatus()) ? milestone.getStatus() : "PLANNED");
        milestone.setDeleted(0);
        milestone.setCreateBy(resolveUserName());
        milestone.setCreateTime(now);
        milestone.setUpdateBy(resolveUserName());
        milestone.setUpdateTime(now);
        return projectMilestoneMapper.insert(milestone) > 0;
    }

    @Override
    @Audit(name = "更新项目里程碑")
    public boolean updateMilestone(OaProjectMilestone milestone) {
        if (milestone == null || milestone.getMilestoneId() == null || milestone.getProjectId() == null) {
            throw new IllegalArgumentException("项目里程碑ID不能为空");
        }
        requireProject(milestone.getProjectId());
        milestone.setUpdateBy(resolveUserName());
        milestone.setUpdateTime(LocalDateTime.now());
        boolean updated = projectMilestoneMapper.updateById(milestone) > 0;
        if (updated) {
            syncProjectRiskLevel(milestone.getProjectId());
        }
        return updated;
    }

    @Override
    public boolean removeMilestones(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        List<OaProjectMilestone> milestones = projectMilestoneMapper.selectBatchIds(ids);
        LambdaUpdateWrapper<OaProjectMilestone> wrapper = new LambdaUpdateWrapper<>();
        wrapper.in(OaProjectMilestone::getMilestoneId, ids)
                .set(OaProjectMilestone::getDeleted, "1")
                .set(OaProjectMilestone::getUpdateBy, resolveUserName())
                .set(OaProjectMilestone::getUpdateTime, LocalDateTime.now());
        boolean updated = projectMilestoneMapper.update(null, wrapper) > 0;
        if (updated) {
            milestones.stream().map(OaProjectMilestone::getProjectId).distinct().forEach(this::syncProjectRiskLevel);
        }
        return updated;
    }

    @Override
    public boolean addRisk(OaProjectRisk risk) {
        if (risk == null || risk.getProjectId() == null || !StringUtils.hasText(risk.getRiskName())) {
            throw new IllegalArgumentException("项目风险信息不完整");
        }
        requireProject(risk.getProjectId());
        LocalDateTime now = LocalDateTime.now();
        risk.setTenantId(resolveTenantId());
        risk.setRiskCode(StringUtils.hasText(risk.getRiskCode()) ? risk.getRiskCode()
                : "RK" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        risk.setRiskLevel(StringUtils.hasText(risk.getRiskLevel()) ? risk.getRiskLevel() : "MEDIUM");
        risk.setStatus(StringUtils.hasText(risk.getStatus()) ? risk.getStatus() : "OPEN");
        risk.setOwnerId(risk.getOwnerId() == null ? UserContext.getUserId() : risk.getOwnerId());
        risk.setOwnerName(StringUtils.hasText(risk.getOwnerName()) ? risk.getOwnerName() : resolveUserName());
        risk.setTriggerSource(StringUtils.hasText(risk.getTriggerSource()) ? risk.getTriggerSource() : "MANUAL");
        risk.setDeleted(0);
        risk.setCreateBy(resolveUserName());
        risk.setCreateTime(now);
        risk.setUpdateBy(resolveUserName());
        risk.setUpdateTime(now);
        boolean inserted = projectRiskMapper.insert(risk) > 0;
        if (inserted) {
            syncProjectRiskLevel(risk.getProjectId());
        }
        return inserted;
    }

    @Override
    @Audit(name = "更新项目风险")
    public boolean updateRisk(OaProjectRisk risk) {
        if (risk == null || risk.getRiskId() == null || risk.getProjectId() == null) {
            throw new IllegalArgumentException("项目风险ID不能为空");
        }
        requireProject(risk.getProjectId());
        risk.setUpdateBy(resolveUserName());
        risk.setUpdateTime(LocalDateTime.now());
        boolean updated = projectRiskMapper.updateById(risk) > 0;
        if (updated) {
            syncProjectRiskLevel(risk.getProjectId());
        }
        return updated;
    }

    @Override
    public boolean removeRisks(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        List<OaProjectRisk> risks = projectRiskMapper.selectBatchIds(ids);
        LambdaUpdateWrapper<OaProjectRisk> wrapper = new LambdaUpdateWrapper<>();
        wrapper.in(OaProjectRisk::getRiskId, ids)
                .set(OaProjectRisk::getDeleted, "1")
                .set(OaProjectRisk::getUpdateBy, resolveUserName())
                .set(OaProjectRisk::getUpdateTime, LocalDateTime.now());
        boolean updated = projectRiskMapper.update(null, wrapper) > 0;
        if (updated) {
            risks.stream().map(OaProjectRisk::getProjectId).distinct().forEach(this::syncProjectRiskLevel);
        }
        return updated;
    }

    @Override
    public boolean addWbsTask(WorkTask task) {
        if (task == null || task.getProjectId() == null || !StringUtils.hasText(task.getTitle())) {
            throw new IllegalArgumentException("WBS任务信息不完整");
        }
        requireProject(task.getProjectId());
        LocalDateTime now = LocalDateTime.now();
        task.setTenantId(resolveTenantId());
        task.setOwnerId(task.getOwnerId() == null ? UserContext.getUserId() : task.getOwnerId());
        task.setAssigneeId(task.getAssigneeId() == null ? UserContext.getUserId() : task.getAssigneeId());
        task.setDeptId(task.getDeptId() == null ? UserContext.getDeptId() : task.getDeptId());
        task.setPriority(task.getPriority() == null ? 1 : task.getPriority());
        task.setStatus(StringUtils.hasText(task.getStatus()) ? task.getStatus() : "TODO");
        task.setWbsCode(StringUtils.hasText(task.getWbsCode()) ? task.getWbsCode() : nextWbsCode(task.getProjectId()));
        task.setProgress(task.getProgress() == null ? BigDecimal.ZERO : task.getProgress());
        task.setEstimatedHours(task.getEstimatedHours() == null ? BigDecimal.ZERO : task.getEstimatedHours());
        task.setActualHours(task.getActualHours() == null ? BigDecimal.ZERO : task.getActualHours());
        task.setBaselineStartTime(task.getBaselineStartTime() == null ? task.getPlannedStartTime() : task.getBaselineStartTime());
        task.setBaselineEndTime(task.getBaselineEndTime() == null ? task.getPlannedEndTime() : task.getBaselineEndTime());
        task.setSortOrder(task.getSortOrder() == null ? nextTaskSortOrder(task.getProjectId()) : task.getSortOrder());
        task.setCreateBy(resolveUserName());
        task.setCreateTime(now);
        task.setUpdateBy(resolveUserName());
        task.setUpdateTime(now);
        task.setDeleted(0);
        return workTaskService.save(task);
    }

    @Override
    @Audit(name = "更新WBS任务")
    public boolean updateWbsTask(WorkTask task) {
        if (task == null || task.getTaskId() == null || task.getProjectId() == null) {
            throw new IllegalArgumentException("WBS任务ID不能为空");
        }
        requireProject(task.getProjectId());
        task.setUpdateBy(resolveUserName());
        task.setUpdateTime(LocalDateTime.now());
        return workTaskService.updateById(task);
    }

    @Override
    @Audit(name = "更新WBS树")
    public boolean updateWbsTree(Long projectId, List<ProjectWbsTreeNodeDTO> nodes) {
        requireProject(projectId);
        if (nodes == null || nodes.isEmpty()) {
            return true;
        }
        for (ProjectWbsTreeNodeDTO node : nodes) {
            if (node == null || node.getTaskId() == null) {
                continue;
            }
            WorkTask task = workTaskService.getById(node.getTaskId());
            if (task == null || !Objects.equals(task.getProjectId(), projectId) || !Integer.valueOf(0).equals(task.getDeleted())) {
                throw new IllegalArgumentException("WBS任务不存在或不属于当前项目");
            }
        }
        return workTaskService.batchUpdateTree(nodes, resolveUserName());
    }

    @Override
    public boolean removeWbsTasks(List<Long> ids) {
        return workTaskService.removeProjectTasks(ids);
    }

    @Override
    public boolean addDependency(OaProjectDependency dependency) {
        validateDependency(dependency, true);
        LocalDateTime now = LocalDateTime.now();
        dependency.setTenantId(resolveTenantId());
        dependency.setDependencyType(StringUtils.hasText(dependency.getDependencyType()) ? dependency.getDependencyType() : "FS");
        dependency.setLagDays(dependency.getLagDays() == null ? 0 : dependency.getLagDays());
        dependency.setDeleted(0);
        dependency.setCreateBy(resolveUserName());
        dependency.setCreateTime(now);
        dependency.setUpdateBy(resolveUserName());
        dependency.setUpdateTime(now);
        return projectDependencyMapper.insert(dependency) > 0;
    }

    @Override
    @Audit(name = "更新项目依赖")
    public boolean updateDependency(OaProjectDependency dependency) {
        if (dependency == null || dependency.getDependencyId() == null) {
            throw new IllegalArgumentException("依赖ID不能为空");
        }
        validateDependency(dependency, false);
        dependency.setUpdateBy(resolveUserName());
        dependency.setUpdateTime(LocalDateTime.now());
        return projectDependencyMapper.updateById(dependency) > 0;
    }

    @Override
    public boolean removeDependencies(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LambdaUpdateWrapper<OaProjectDependency> wrapper = new LambdaUpdateWrapper<>();
        wrapper.in(OaProjectDependency::getDependencyId, ids)
                .set(OaProjectDependency::getDeleted, "1")
                .set(OaProjectDependency::getUpdateBy, resolveUserName())
                .set(OaProjectDependency::getUpdateTime, LocalDateTime.now());
        return projectDependencyMapper.update(null, wrapper) > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean snapshotBaseline(Long projectId) {
        OaProject project = requireProject(projectId);
        List<OaProjectMilestone> milestones = listMilestones(projectId);
        for (OaProjectMilestone milestone : milestones) {
            OaProjectMilestone update = new OaProjectMilestone();
            update.setMilestoneId(milestone.getMilestoneId());
            update.setProjectId(projectId);
            update.setBaselineDate(milestone.getPlannedDate());
            update.setUpdateBy(resolveUserName());
            update.setUpdateTime(LocalDateTime.now());
            projectMilestoneMapper.updateById(update);
        }
        List<WorkTask> tasks = listWbsTasks(projectId);
        for (WorkTask task : tasks) {
            WorkTask update = new WorkTask();
            update.setTaskId(task.getTaskId());
            update.setProjectId(projectId);
            update.setBaselineStartTime(task.getPlannedStartTime());
            update.setBaselineEndTime(task.getPlannedEndTime());
            update.setUpdateBy(resolveUserName());
            update.setUpdateTime(LocalDateTime.now());
            workTaskService.updateById(update);
        }
        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaProject::getProjectId, projectId)
                .set(OaProject::getBaselineVersion, defaultInt(project.getBaselineVersion()) + 1)
                .set(OaProject::getUpdateBy, resolveUserName())
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        return update(null, wrapper);
    }

    @Override
    public boolean archiveProject(Long projectId) {
        OaProject project = requireProject(projectId);
        if (!List.of("COMPLETED", "CANCELLED", "APPROVED", "IN_PROGRESS").contains(project.getStatus())) {
            throw new IllegalArgumentException("当前项目状态不允许归档");
        }
        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaProject::getProjectId, projectId)
                .set(OaProject::getStatus, "ARCHIVED")
                .set(OaProject::getUpdateBy, resolveUserName())
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        return update(null, wrapper);
    }

    private void validate(OaProject project) {
        if (project == null) {
            throw new IllegalArgumentException("项目不能为空");
        }
        if (!StringUtils.hasText(project.getProjectName())) {
            throw new IllegalArgumentException("项目名称不能为空");
        }
        if (project.getBudgetAmount() == null) {
            project.setBudgetAmount(BigDecimal.ZERO);
        }
        if (project.getProgress() == null) {
            project.setProgress(BigDecimal.ZERO);
        }
    }

    private OaProject findExistingSourceProject(OaProject project) {
        if (project == null || !StringUtils.hasText(project.getSourceType()) || project.getSourceId() == null) {
            return null;
        }
        return getOne(new LambdaQueryWrapper<OaProject>()
                .eq(OaProject::getDeleted, "0")
                .eq(OaProject::getSourceType, project.getSourceType())
                .eq(OaProject::getSourceId, project.getSourceId())
                .last("limit 1"), false);
    }

    private OaProject requireProject(Long projectId) {
        OaProject project = getById(projectId);
        if (project == null || !Integer.valueOf(0).equals(project.getDeleted())) {
            throw new IllegalArgumentException("项目不存在");
        }
        return project;
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId();
    }

    private String resolveUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data != null ? String.valueOf(data) : null;
    }

    private void refreshProjectActualCost(Long projectId) {
        ProjectCostSummaryVO summary = getCostSummary(projectId);
        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaProject::getProjectId, projectId)
                .set(OaProject::getActualCostAmount, summary.getTotalAmount())
                .set(OaProject::getUpdateBy, resolveUserName())
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        update(null, wrapper);
    }

    private void syncProjectRiskLevel(Long projectId) {
        OaProject project = getById(projectId);
        if (project == null) {
            return;
        }
        String riskLevel = resolveProjectRiskLevel(projectId);
        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(OaProject::getProjectId, projectId)
                .set(OaProject::getRiskLevel, riskLevel)
                .set(OaProject::getUpdateBy, resolveUserName())
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        update(null, wrapper);
    }

    private String resolveProjectRiskLevel(Long projectId) {
        List<OaProjectRisk> manualRisks = projectRiskMapper.selectList(new LambdaQueryWrapper<OaProjectRisk>()
                .eq(OaProjectRisk::getProjectId, projectId)
                .eq(OaProjectRisk::getDeleted, "0")
                .ne(OaProjectRisk::getStatus, "CLOSED"));
        String level = "LOW";
        for (OaProjectRisk risk : manualRisks) {
            level = maxRiskLevel(level, risk.getRiskLevel());
        }
        for (OaProjectMilestone milestone : listMilestones(projectId)) {
            if (isMilestoneOverdue(milestone)) {
                level = maxRiskLevel(level, "HIGH");
            }
        }
        return level;
    }

    private void appendMilestoneOverdueRisks(Long projectId, List<OaProjectRisk> risks) {
        for (OaProjectMilestone milestone : listMilestones(projectId)) {
            if (!isMilestoneOverdue(milestone)) {
                continue;
            }
            OaProjectRisk risk = new OaProjectRisk();
            risk.setProjectId(projectId);
            risk.setRiskCode("AUTO-MILESTONE-" + milestone.getMilestoneId());
            risk.setRiskName("里程碑逾期");
            risk.setRiskLevel("HIGH");
            risk.setStatus("OPEN");
            risk.setTriggerSource("MILESTONE_OVERDUE");
            risk.setOwnerId(milestone.getOwnerId());
            risk.setOwnerName(milestone.getOwnerName());
            risk.setSummary("里程碑 " + milestone.getMilestoneName() + " 已逾期");
            risk.setActionPlan("调整计划或补充资源");
            risks.add(risk);
        }
    }

    private boolean isMilestoneOverdue(OaProjectMilestone milestone) {
        return milestone.getPlannedDate() != null
                && milestone.getPlannedDate().isBefore(java.time.LocalDate.now())
                && milestone.getActualDate() == null
                && !"COMPLETED".equalsIgnoreCase(milestone.getStatus());
    }

    private String maxRiskLevel(String left, String right) {
        return riskWeight(right) > riskWeight(left) ? right : left;
    }

    private int riskWeight(String level) {
        if ("CRITICAL".equalsIgnoreCase(level)) {
            return 4;
        }
        if ("HIGH".equalsIgnoreCase(level)) {
            return 3;
        }
        if ("MEDIUM".equalsIgnoreCase(level)) {
            return 2;
        }
        return 1;
    }

    private BigDecimal sumExpenseAmount(Long projectId) {
        return expenseClaimMapper.selectList(new LambdaQueryWrapper<BizExpenseClaim>()
                        .eq(BizExpenseClaim::getProjectId, projectId)
                        .eq(BizExpenseClaim::getDeleted, "0")
                        .in(BizExpenseClaim::getStatus, "PENDING", "APPROVED", "PAID"))
                .stream()
                .map(BizExpenseClaim::getTotalAmount)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumPurchaseAmount(Long projectId) {
        return purchaseRequestMapper.selectList(new LambdaQueryWrapper<BizPurchaseRequest>()
                        .eq(BizPurchaseRequest::getProjectId, projectId)
                        .eq(BizPurchaseRequest::getDeleted, "0")
                        .in(BizPurchaseRequest::getStatus, "PENDING", "APPROVED"))
                .stream()
                .map(BizPurchaseRequest::getTotalAmount)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumPaymentAmount(Long projectId) {
        return paymentRequestMapper.selectList(new LambdaQueryWrapper<BizPaymentRequest>()
                        .eq(BizPaymentRequest::getProjectId, projectId)
                        .eq(BizPaymentRequest::getDeleted, "0")
                        .in(BizPaymentRequest::getStatus, "PENDING", "APPROVED", "PAID"))
                .stream()
                .map(BizPaymentRequest::getAmount)
                .filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String nextWbsCode(Long projectId) {
        List<WorkTask> tasks = workTaskService.listProjectTasks(projectId);
        int next = tasks.size() + 1;
        return String.format("WBS-%03d", next);
    }

    private String resolveSourceName(OaProject project) {
        if (project == null) {
            return null;
        }
        if (StringUtils.hasText(project.getSourceName())) {
            return project.getSourceName();
        }
        if ("CRM_OPPORTUNITY".equalsIgnoreCase(project.getSourceType()) || "CRM_QUOTE".equalsIgnoreCase(project.getSourceType())) {
            return project.getProjectName();
        }
        if ("CONTRACT".equalsIgnoreCase(project.getSourceType()) && StringUtils.hasText(project.getContractNo())) {
            return project.getContractNo();
        }
        return project.getProjectName();
    }

    private int nextMilestoneSortOrder(Long projectId) {
        return listMilestones(projectId).stream()
                .map(OaProjectMilestone::getSortOrder)
                .filter(Objects::nonNull)
                .max(Integer::compareTo)
                .orElse(0) + 1;
    }

    private int nextTaskSortOrder(Long projectId) {
        return listWbsTasks(projectId).stream()
                .map(WorkTask::getSortOrder)
                .filter(Objects::nonNull)
                .max(Integer::compareTo)
                .orElse(0) + 1;
    }

    private void validateDependency(OaProjectDependency dependency, boolean create) {
        if (dependency == null) {
            throw new IllegalArgumentException("依赖不能为空");
        }
        if (dependency.getProjectId() == null) {
            throw new IllegalArgumentException("项目ID不能为空");
        }
        requireProject(dependency.getProjectId());
        if (!StringUtils.hasText(dependency.getPredecessorType()) || dependency.getPredecessorId() == null
                || !StringUtils.hasText(dependency.getSuccessorType()) || dependency.getSuccessorId() == null) {
            throw new IllegalArgumentException("依赖前置和后置对象不能为空");
        }
        if (Objects.equals(dependency.getPredecessorType(), dependency.getSuccessorType())
                && Objects.equals(dependency.getPredecessorId(), dependency.getSuccessorId())) {
            throw new IllegalArgumentException("依赖前置和后置不能相同");
        }
        if (create) {
            Long count = projectDependencyMapper.selectCount(new LambdaQueryWrapper<OaProjectDependency>()
                    .eq(OaProjectDependency::getProjectId, dependency.getProjectId())
                    .eq(OaProjectDependency::getPredecessorType, dependency.getPredecessorType())
                    .eq(OaProjectDependency::getPredecessorId, dependency.getPredecessorId())
                    .eq(OaProjectDependency::getSuccessorType, dependency.getSuccessorType())
                    .eq(OaProjectDependency::getSuccessorId, dependency.getSuccessorId())
                    .eq(OaProjectDependency::getDeleted, "0"));
            if (count != null && count > 0) {
                throw new IllegalArgumentException("项目依赖已存在");
            }
        }
    }

    private ProjectKpiVO buildProjectKpi(Long projectId) {
        List<OaProjectMilestone> milestones = listMilestones(projectId);
        List<WorkTask> tasks = listWbsTasks(projectId);
        List<OaProjectRisk> risks = listRisks(projectId);
        ProjectCostSummaryVO costSummary = getCostSummary(projectId);
        OaProject project = requireProject(projectId);

        ProjectKpiVO kpi = new ProjectKpiVO();
        kpi.setOverdueMilestoneCount((int) milestones.stream().filter(this::isMilestoneOverdue).count());
        kpi.setOverdueTaskCount((int) tasks.stream().filter(this::isTaskOverdue).count());
        kpi.setOpenRiskCount((int) risks.stream().filter(item -> !"CLOSED".equalsIgnoreCase(item.getStatus())).count());
        kpi.setScheduleVarianceDays(resolveScheduleVarianceDays(milestones, tasks));
        BigDecimal budget = defaultDecimal(project.getBudgetAmount());
        BigDecimal total = defaultDecimal(costSummary.getTotalAmount());
        kpi.setCostExecutionRate(budget.signum() <= 0
                ? BigDecimal.ZERO
                : total.divide(budget, 4, RoundingMode.HALF_UP).multiply(new BigDecimal("100")));
        return kpi;
    }

    private ProjectLinkSummaryVO buildProjectLinkSummary(OaProject project) {
        ProjectLinkSummaryVO summary = new ProjectLinkSummaryVO();
        summary.setSourceType(project.getSourceType());
        summary.setSourceId(project.getSourceId());
        summary.setSourceName(project.getSourceName());
        summary.setContractId(project.getContractId());
        summary.setContractNo(project.getContractNo());
        summary.setCustomerName(project.getCustomerName());
        ProjectCostSummaryVO costSummary = getCostSummary(project.getProjectId());
        summary.setExpenseAmount(costSummary.getExpenseAmount());
        summary.setPurchaseAmount(costSummary.getPurchaseAmount());
        summary.setPaymentAmount(costSummary.getPaymentAmount());

        List<OaBudgetPlan> budgets = budgetPlanMapper.selectList(new LambdaQueryWrapper<OaBudgetPlan>()
                .eq(OaBudgetPlan::getDeleted, "0")
                .eq(OaBudgetPlan::getProjectId, project.getProjectId())
                .orderByDesc(OaBudgetPlan::getUpdateTime));
        if (budgets.isEmpty()) {
            summary.setBudgetSummary("未关联项目预算");
        } else {
            long warningCount = budgets.stream().filter(this::isBudgetWarning).count();
            summary.setBudgetSummary("预算 " + budgets.size() + " 条，预警 " + warningCount + " 条");
        }

        List<OaInvoice> invoices = invoiceMapper.selectList(new LambdaQueryWrapper<OaInvoice>()
                .eq(OaInvoice::getDeleted, "0")
                .and(wrapper -> {
                    if (project.getContractId() != null) {
                        wrapper.eq(OaInvoice::getContractId, project.getContractId());
                    } else if (project.getCustomerId() != null) {
                        wrapper.eq(OaInvoice::getCustomerId, project.getCustomerId());
                    }
                }));
        if (invoices.isEmpty()) {
            summary.setInvoiceSummary("未关联合同/客户发票");
        } else {
            long full = invoices.stream().filter(item -> "WRITEOFF_FULL".equals(item.getStatus())).count();
            long partial = invoices.stream().filter(item -> "WRITEOFF_PARTIAL".equals(item.getStatus())).count();
            summary.setInvoiceSummary("发票 " + invoices.size() + " 张，全额核销 " + full + " 张，部分核销 " + partial + " 张");
        }

        if (project.getContractId() != null && !StringUtils.hasText(summary.getContractNo())) {
            OaContract contract = contractMapper.selectById(project.getContractId());
            if (contract != null) {
                summary.setContractNo(contract.getContractNo());
            }
        }
        return summary;
    }

    private boolean isTaskOverdue(WorkTask task) {
        return task != null
                && task.getPlannedEndTime() != null
                && task.getPlannedEndTime().toLocalDate().isBefore(LocalDate.now())
                && task.getActualEndTime() == null
                && !"DONE".equalsIgnoreCase(task.getStatus());
    }

    private BigDecimal resolveScheduleVarianceDays(List<OaProjectMilestone> milestones, List<WorkTask> tasks) {
        long variance = 0L;
        for (OaProjectMilestone milestone : milestones) {
            if (milestone.getPlannedDate() != null && milestone.getBaselineDate() != null) {
                variance += Math.abs(java.time.temporal.ChronoUnit.DAYS.between(milestone.getBaselineDate(), milestone.getPlannedDate()));
            }
        }
        for (WorkTask task : tasks) {
            if (task.getPlannedEndTime() != null && task.getBaselineEndTime() != null) {
                variance += Math.abs(java.time.temporal.ChronoUnit.DAYS.between(task.getBaselineEndTime().toLocalDate(), task.getPlannedEndTime().toLocalDate()));
            }
        }
        return BigDecimal.valueOf(variance);
    }

    private boolean isBudgetWarning(OaBudgetPlan budget) {
        BigDecimal total = defaultDecimal(budget.getTotalAmount());
        if (total.signum() <= 0) {
            return false;
        }
        BigDecimal used = defaultDecimal(budget.getReservedAmount()).add(defaultDecimal(budget.getActualAmount()));
        BigDecimal ratio = used.divide(total, 4, RoundingMode.HALF_UP);
        return ratio.compareTo(new BigDecimal("0.80")) >= 0;
    }

    private BigDecimal defaultDecimal(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private int defaultInt(Integer value) {
        return value == null ? 0 : value;
    }
}

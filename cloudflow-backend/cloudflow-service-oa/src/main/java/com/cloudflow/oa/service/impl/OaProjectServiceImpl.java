package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
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
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.OaProjectRisk;

import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.event.ProjectSubmittedEvent;
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

import com.cloudflow.oa.mapper.OaProjectRiskMapper;
import com.cloudflow.oa.service.IOaProjectService;

import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final OaProjectTaskService projectTaskService;
    private final OaProjectRiskMapper projectRiskMapper;
    private final OaProjectDependencyMapper projectDependencyMapper;

    private final OaBudgetPlanMapper budgetPlanMapper;
    private final OaInvoiceMapper invoiceMapper;
    private final OaContractMapper contractMapper;
    private final BizExpenseClaimMapper expenseClaimMapper;
    private final BizPurchaseRequestMapper purchaseRequestMapper;
    private final BizPaymentRequestMapper paymentRequestMapper;
    private final OutboxPublisher outboxPublisher;
    private final OaProjectAccountingService accounting;
    private final ObjectMapper objectMapper;
    private final ProjectExecutionStateService projectExecutionStateService;

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
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
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
        project.setActualCostAmount(BigDecimal.ZERO); project.setLaborCostAmount(BigDecimal.ZERO); project.setPurchaseCostAmount(BigDecimal.ZERO);
        project.setBillableAmount(BigDecimal.ZERO); project.setBilledAmount(BigDecimal.ZERO); project.setActualHours(BigDecimal.ZERO);
        project.setGrossMargin(BigDecimal.ZERO); project.setGrossMarginRate(null);
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
        accounting.recalculate(project.getProjectId());
        return project.getProjectId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "更新项目")
    public boolean updateProject(OaProject project) {
        if (project == null || project.getProjectId() == null) {
            throw new IllegalArgumentException("项目ID不能为空");
        }
        validate(project);
        OaProject persisted = OaRecordSupport.active(baseMapper.selectForUpdate(project.getProjectId(), resolveTenantId()));
        if (!Objects.equals(project.getVersion(), persisted.getVersion())) throw new IllegalStateException("记录已修改，请刷新后重试");
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(persisted, OaProject::getOwnerId, "项目");
        project.setTenantId(persisted.getTenantId());
        project.setProjectNo(StringUtils.hasText(project.getProjectNo()) ? project.getProjectNo() : persisted.getProjectNo());
        project.setInstanceId(persisted.getInstanceId());
        project.setStatus(StringUtils.hasText(project.getStatus()) ? project.getStatus() : persisted.getStatus());
        project.setActualCostAmount(persisted.getActualCostAmount()); project.setLaborCostAmount(persisted.getLaborCostAmount());
        project.setPurchaseCostAmount(persisted.getPurchaseCostAmount()); project.setBillableAmount(persisted.getBillableAmount());
        project.setBilledAmount(persisted.getBilledAmount()); project.setActualHours(persisted.getActualHours());
        project.setGrossMargin(persisted.getGrossMargin()); project.setGrossMarginRate(persisted.getGrossMarginRate());
        project.setOwnerId(project.getOwnerId() == null ? persisted.getOwnerId() : project.getOwnerId());
        project.setOwnerName(StringUtils.hasText(project.getOwnerName()) ? project.getOwnerName() : persisted.getOwnerName());
        project.setDeptId(project.getDeptId() == null ? persisted.getDeptId() : project.getDeptId());
        project.setDeptName(StringUtils.hasText(project.getDeptName()) ? project.getDeptName() : persisted.getDeptName());
        project.setRiskLevel(StringUtils.hasText(project.getRiskLevel()) ? project.getRiskLevel() : persisted.getRiskLevel());
        project.setSourceName(StringUtils.hasText(project.getSourceName()) ? project.getSourceName() : persisted.getSourceName());
        project.setBaselineVersion(project.getBaselineVersion() == null ? persisted.getBaselineVersion() : project.getBaselineVersion());
        project.setStatus(persisted.getStatus());
        project.setActualStartDate(persisted.getActualStartDate());
        project.setActualEndDate(persisted.getActualEndDate());
        project.setUpdateBy(UserContext.getUserName());
        project.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(project);
        OaRecordSupport.saved(updated ? 1 : 0);
        if (updated) { accounting.recalculate(project.getProjectId()); projectExecutionStateService.syncProjectStatus(project.getProjectId(), resolveUserName()); }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
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
        boolean updated = updateById(project);
        if (updated) {
            if ((project.getBaselineVersion() == null || project.getBaselineVersion() <= 0)) {
                snapshotBaseline(projectId);
            }
            refreshProjectActualCost(projectId);
            syncProjectRiskLevel(projectId);
            ProjectSubmittedEvent event = new ProjectSubmittedEvent();
            event.setProjectId(project.getProjectId());
            event.setProjectNo(project.getProjectNo());
            event.setOwnerId(project.getOwnerId());
            event.setOwnerName(project.getOwnerName());
            event.setSubmittedAt(LocalDateTime.now());
            publishProjectSubmittedEvent(project, event);
        }
        return updated;
    }

    public void startProjectWorkflow(OaProject project) {
        try {
            InternalWorkflowStartDTO dto = new InternalWorkflowStartDTO();
            dto.setTenantId(project.getTenantId());
            dto.setProcessDefKey("project_approval");
            dto.setBusinessKey("PROJECT:" + project.getProjectId());
            dto.setStartUserId(project.getOwnerId());
            dto.setStartUserName(project.getOwnerName());
            Map<String, Object> variables = new HashMap<>();
            variables.put("projectId", project.getProjectId());
            variables.put("projectNo", project.getProjectNo());
            variables.put("projectName", project.getProjectName());
            variables.put("budgetAmount", project.getBudgetAmount());
            variables.put("customerName", project.getCustomerName());
            variables.put("ownerName", project.getOwnerName());
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.PROJECT,
                    project.getProjectId(),
                    project.getProjectNo(),
                    "workflow:stream:approval-callback:oa"
            );
            dto.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcessInternal(dto);
            if (result != null && result.isSuccess() && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (StringUtils.hasText(instanceId)) {
                    LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<>();
                    wrapper.eq(OaProject::getProjectId, project.getProjectId())
                            .and(w -> w.isNull(OaProject::getInstanceId).or().eq(OaProject::getInstanceId, ""))
                            .set(OaProject::getInstanceId, instanceId)
                            .set(OaProject::getUpdateBy, "event-consumer")
                            .set(OaProject::getUpdateTime, LocalDateTime.now());
                    update(null, wrapper);
                }
            }
        } catch (Exception e) {
            log.error("项目 {} 启动工作流失败: {}", project.getProjectNo(), e.getMessage(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.PROJECT, project.getProjectId(), project.getProjectNo(),
                    project.getOwnerName(), project.getOwnerId(), e);
        }
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
    public List<OaProjectTask> listMilestones(Long projectId) {
        return projectTaskService.list(projectId).stream().filter(task -> Integer.valueOf(1).equals(task.getIsMilestoneFlag())).toList();
    }

    @Override
    public List<OaProjectTask> listWbsTasks(Long projectId) { return projectTaskService.list(projectId); }

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
        OaProject project = requireProject(projectId);
        ProjectCostSummaryVO summary = new ProjectCostSummaryVO(); summary.setProjectId(projectId);
        summary.setExpenseAmount(sumExpenseAmount(projectId)); summary.setPaymentAmount(sumPaymentAmount(projectId));
        summary.setPurchaseAmount(OaRecordSupport.zero(project.getPurchaseCostAmount()));
        summary.setLaborAmount(OaRecordSupport.zero(project.getLaborCostAmount())); summary.setOtherAmount(OaRecordSupport.zero(project.getOtherCostAmount()));
        summary.setBillableAmount(OaRecordSupport.zero(project.getBillableAmount())); summary.setBilledAmount(OaRecordSupport.zero(project.getBilledAmount()));
        summary.setTotalAmount(OaRecordSupport.zero(project.getActualCostAmount()));
        return summary;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean addMember(OaProjectMember member) {
        if (member == null || member.getProjectId() == null || member.getUserId() == null) {
            throw new IllegalArgumentException("项目成员信息不完整");
        }
        OaRecordSupport.active(baseMapper.selectForUpdate(member.getProjectId(), resolveTenantId()));
        validateMemberPeriod(member);
        member.setUserName(StringUtils.hasText(member.getUserName()) ? member.getUserName() : resolveUserName());
        member.setRoleCode(StringUtils.hasText(member.getRoleCode()) ? member.getRoleCode() : "MEMBER");
        member.setRoleName(StringUtils.hasText(member.getRoleName()) ? member.getRoleName() : "项目成员");
        member.setBillableFlag(member.getBillableFlag() == null ? 1 : OaRecordSupport.flag(member.getBillableFlag()));
        OaRecordSupport.create(member, "id");
        OaRecordSupport.saved(projectMemberMapper.insert(member));
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新项目成员", highRisk = true)
    public boolean updateMember(OaProjectMember member) {
        if (member == null || member.getId() == null || member.getProjectId() == null) {
            throw new IllegalArgumentException("项目成员ID不能为空");
        }
        OaRecordSupport.active(baseMapper.selectForUpdate(member.getProjectId(), resolveTenantId()));
        OaProjectMember previous = OaRecordSupport.active(projectMemberMapper.selectById(member.getId()));
        OaRecordSupport.same(previous.getProjectId(), member.getProjectId(), "成员不能更换所属项目");
        if (member.getUserId() != null) OaRecordSupport.same(previous.getUserId(), member.getUserId(), "成员不能更换员工");
        member.setUserId(previous.getUserId());
        if (member.getJoinDate() == null) member.setJoinDate(previous.getJoinDate());
        if (!StringUtils.hasText(member.getUserName())) member.setUserName(previous.getUserName());
        if (!StringUtils.hasText(member.getRoleCode())) member.setRoleCode(previous.getRoleCode());
        if (!StringUtils.hasText(member.getRoleName())) member.setRoleName(previous.getRoleName());
        member.setBillableFlag(member.getBillableFlag() == null ? previous.getBillableFlag() : OaRecordSupport.flag(member.getBillableFlag()));
        validateMemberPeriod(member);
        OaRecordSupport.update(member, previous);
        OaRecordSupport.saved(projectMemberMapper.update(null, new LambdaUpdateWrapper<OaProjectMember>()
                .eq(OaProjectMember::getId, member.getId()).eq(OaProjectMember::getTenantId, resolveTenantId())
                .eq(OaProjectMember::getProjectId, previous.getProjectId()).eq(OaProjectMember::getDeleted, 0)
                .set(OaProjectMember::getUserName, member.getUserName()).set(OaProjectMember::getRoleCode, member.getRoleCode())
                .set(OaProjectMember::getRoleName, member.getRoleName()).set(OaProjectMember::getBillableFlag, member.getBillableFlag())
                .set(OaProjectMember::getJoinDate, member.getJoinDate()).set(OaProjectMember::getLeaveDate, member.getLeaveDate())
                .set(OaProjectMember::getUpdateBy, member.getUpdateBy()).set(OaProjectMember::getUpdateTime, member.getUpdateTime())));
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除项目成员", highRisk = true)
    public boolean removeMembers(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return true;
        List<Long> memberIds = ids.stream().distinct().sorted().toList();
        List<OaProjectMember> records = new ArrayList<>();
        for (Long memberId : memberIds) records.add(OaRecordSupport.active(projectMemberMapper.selectById(memberId)));
        for (Long projectId : records.stream().map(OaProjectMember::getProjectId).distinct().sorted().toList()) {
            OaRecordSupport.active(baseMapper.selectForUpdate(projectId, resolveTenantId()));
        }
        int affected = projectMemberMapper.update(null, new LambdaUpdateWrapper<OaProjectMember>()
                .in(OaProjectMember::getId, memberIds).eq(OaProjectMember::getTenantId, resolveTenantId())
                .eq(OaProjectMember::getDeleted, 0).set(OaProjectMember::getDeleted, 1)
                .set(OaProjectMember::getUpdateBy, resolveUserName()).set(OaProjectMember::getUpdateTime, LocalDateTime.now()));
        if (affected != memberIds.size()) throw new IllegalStateException("成员记录已修改，请刷新后重试");
        return true;
    }

    private void validateMemberPeriod(OaProjectMember member) {
        if (member.getJoinDate() != null && member.getLeaveDate() != null && member.getLeaveDate().isBefore(member.getJoinDate())) {
            throw new IllegalArgumentException("退出日期不能早于加入日期");
        }
    }

    @Override
    public boolean addMilestone(OaProjectTask milestone) {
        milestone.setTaskId(null); milestone.setIsMilestoneFlag(1); milestone.setIsGroupFlag(0); projectTaskService.saveTask(milestone); return true;
    }

    @Override
    @Audit(name = "更新项目里程碑", highRisk = true)
    public boolean updateMilestone(OaProjectTask milestone) {
        if (!Integer.valueOf(1).equals(projectTaskService.detail(milestone.getTaskId()).getIsMilestoneFlag())) throw new IllegalArgumentException("指定任务不是里程碑");
        milestone.setIsMilestoneFlag(1); milestone.setIsGroupFlag(0); projectTaskService.saveTask(milestone); syncProjectRiskLevel(milestone.getProjectId()); return true;
    }

    @Override
    @Audit(name = "删除项目里程碑", highRisk = true)
    public boolean removeMilestones(List<Long> ids) {
        for (Long id : ids) if (!Integer.valueOf(1).equals(projectTaskService.detail(id).getIsMilestoneFlag())) throw new IllegalArgumentException("指定任务不是里程碑");
        projectTaskService.removeTasks(ids); return true;
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
    @Audit(name = "更新项目风险", highRisk = true)
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
    @Audit(name = "删除项目风险", highRisk = true)
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
    public boolean addWbsTask(OaProjectTask task) { task.setTaskId(null); projectTaskService.saveTask(task); return true; }

    @Override
    @Audit(name = "更新WBS任务", highRisk = true)
    public boolean updateWbsTask(OaProjectTask task) { OaRecordSupport.require(task.getTaskId(), "任务ID不能为空"); projectTaskService.saveTask(task); return true; }

    @Override
    @Audit(name = "更新WBS树")
    public boolean updateWbsTree(Long projectId, List<ProjectWbsTreeNodeDTO> nodes) { projectTaskService.updateTree(projectId, nodes); return true; }

    @Override
    @Audit(name = "删除WBS任务", highRisk = true)
    public boolean removeWbsTasks(List<Long> ids) { projectTaskService.removeTasks(ids); return true; }

    @Override
    public boolean addDependency(OaProjectDependency dependency) { dependency.setDependencyId(null); projectTaskService.saveDependency(dependency); return true; }

    @Override
    @Audit(name = "更新项目依赖", highRisk = true)
    public boolean updateDependency(OaProjectDependency dependency) { OaRecordSupport.require(dependency.getDependencyId(), "依赖ID不能为空"); projectTaskService.saveDependency(dependency); return true; }

    @Override
    @Audit(name = "删除项目依赖", highRisk = true)
    public boolean removeDependencies(List<Long> ids) { projectTaskService.removeDependencies(ids); return true; }

    @Override
    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean snapshotBaseline(Long projectId) { projectTaskService.snapshotBaseline(projectId); return true; }

    @Override
    public boolean archiveProject(Long projectId) {
        projectExecutionStateService.syncProjectStatus(projectId, resolveUserName());
        OaProject project = requireProject(projectId);
        if (!List.of("COMPLETED", "CANCELLED").contains(project.getStatus())) {
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
        if (project != null) {
            project.setPercentCompleteMode(OaRecordSupport.code(project.getPercentCompleteMode(), "TASK_COMPLETION", java.util.Set.of("MANUAL", "TASK_COMPLETION", "TASK_PROGRESS")));
            project.setEstimatedCost(OaRecordSupport.decimal(OaRecordSupport.zero(project.getEstimatedCost()), 18, 2, false, "预估成本"));
            project.setOtherCostAmount(OaRecordSupport.decimal(OaRecordSupport.zero(project.getOtherCostAmount()), 18, 2, false, "其他成本"));
        }
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
        return page(new Page<>(1, 1, false), new LambdaQueryWrapper<OaProject>()
                .eq(OaProject::getDeleted, "0")
                .eq(OaProject::getSourceType, project.getSourceType())
                .eq(OaProject::getSourceId, project.getSourceId()))
                .getRecords().stream().findFirst().orElse(null);
    }

    private OaProject requireProject(Long projectId) {
        OaProject project = getById(projectId);
        if (project == null || !Integer.valueOf(0).equals(project.getDeleted())) {
            throw new IllegalArgumentException("项目不存在");
        }
        return project;
    }

    private Long resolveTenantId() { return OaRecordSupport.tenantId(); }

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



    private void publishProjectSubmittedEvent(OaProject project, ProjectSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("PROJECT_SUBMITTED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(project.getProjectId())
                    .tenantId(project.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("项目提交事件发布失败, projectId={}, error={}", project.getProjectId(), e.getMessage());
        }
    }

    private void refreshProjectActualCost(Long projectId) {
        accounting.recalculate(projectId);
    }

    private void syncProjectRiskLevel(Long projectId) {
        OaProject project = getById(projectId);
        if (project == null) {
            return;
        }
        String riskLevel = resolveProjectRiskLevel(projectId);
        if (Objects.equals(project.getRiskLevel(), riskLevel)) return;
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
        for (OaProjectTask milestone : listMilestones(projectId)) {
            if (isMilestoneOverdue(milestone)) {
                level = maxRiskLevel(level, "HIGH");
            }
        }
        return level;
    }

    private void appendMilestoneOverdueRisks(Long projectId, List<OaProjectRisk> risks) {
        for (OaProjectTask milestone : listMilestones(projectId)) {
            if (!isMilestoneOverdue(milestone)) {
                continue;
            }
            OaProjectRisk risk = new OaProjectRisk();
            risk.setProjectId(projectId);
            risk.setRiskCode("AUTO-MILESTONE-" + milestone.getTaskId());
            risk.setRiskName("里程碑逾期");
            risk.setRiskLevel("HIGH");
            risk.setStatus("OPEN");
            risk.setTriggerSource("MILESTONE_OVERDUE");
            risk.setOwnerId(milestone.getAssigneeId());
            risk.setOwnerName(milestone.getAssigneeName());
            risk.setSummary("里程碑 " + milestone.getSubject() + " 已逾期");
            risk.setActionPlan("调整计划或补充资源");
            risks.add(risk);
        }
    }

    private boolean isMilestoneOverdue(OaProjectTask milestone) { return isTaskOverdue(milestone); }

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







    private ProjectKpiVO buildProjectKpi(Long projectId) {
        List<OaProjectTask> milestones = listMilestones(projectId);
        List<OaProjectTask> tasks = listWbsTasks(projectId);
        List<OaProjectRisk> risks = listRisks(projectId);
        ProjectCostSummaryVO costSummary = getCostSummary(projectId);
        OaProject project = requireProject(projectId);

        ProjectKpiVO kpi = new ProjectKpiVO();
        kpi.setOverdueMilestoneCount((int) milestones.stream().filter(this::isMilestoneOverdue).count());
        kpi.setOverdueTaskCount((int) tasks.stream().filter(this::isTaskOverdue).count());
        kpi.setOpenRiskCount((int) risks.stream().filter(item -> !"CLOSED".equalsIgnoreCase(item.getStatus())).count());
        kpi.setScheduleVarianceDays(resolveScheduleVarianceDays(tasks));
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

        List<OaInvoice> invoices = List.of();
        if (project.getContractId() != null || project.getCustomerId() != null) {
            LambdaQueryWrapper<OaInvoice> invoiceQuery = new LambdaQueryWrapper<OaInvoice>()
                    .eq(OaInvoice::getDeleted, "0");
            if (project.getContractId() != null) {
                invoiceQuery.eq(OaInvoice::getContractId, project.getContractId());
            } else {
                invoiceQuery.eq(OaInvoice::getCustomerId, project.getCustomerId());
            }
            invoices = invoiceMapper.selectList(invoiceQuery);
        }
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

    private boolean isTaskOverdue(OaProjectTask task) {
        return task.getPlannedEnd() != null && task.getPlannedEnd().toLocalDate().isBefore(LocalDate.now()) && task.getActualEnd() == null
                && !List.of("COMPLETED", "CANCELLED").contains(task.getStatus());
    }

    private BigDecimal resolveScheduleVarianceDays(List<OaProjectTask> tasks) {
        long variance = 0L;
        for (OaProjectTask task : tasks) if (task.getPlannedEnd() != null && task.getBaselineEnd() != null)
            variance += Math.abs(java.time.temporal.ChronoUnit.DAYS.between(task.getBaselineEnd().toLocalDate(), task.getPlannedEnd().toLocalDate()));
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

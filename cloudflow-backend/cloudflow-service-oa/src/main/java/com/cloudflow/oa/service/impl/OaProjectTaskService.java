package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OaProjectTaskService {
    private final OaProjectMapper projectMapper;
    private final OaProjectTaskMapper taskMapper;
    private final OaProjectDependencyMapper dependencyMapper;
    private final OaTimesheetDetailMapper timesheetDetailMapper;
    private final WorkTaskMapper workTaskMapper;
    private final OaIdentityReferenceMapper identities;
    private final ProjectExecutionStateService execution;
    private final OaBusinessRuleService businessRuleService;

    private OaProject lockWritableProject(Long projectId) {
        OaProject project = OaRecordSupport.active(projectMapper.selectForUpdate(projectId, OaRecordSupport.tenantId()));
        if (Set.of("ARCHIVED", "CANCELLED").contains(project.getStatus())) throw new IllegalArgumentException("归档或取消项目不可修改任务");
        return project;
    }

    public List<OaProjectTask> list(Long projectId) {
        OaRecordSupport.active(projectMapper.selectById(projectId));
        return taskMapper.selectList(new LambdaQueryWrapper<OaProjectTask>().eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                .eq(OaProjectTask::getProjectId, projectId).eq(OaProjectTask::getDeleted, 0).orderByAsc(OaProjectTask::getSortNo, OaProjectTask::getTaskId));
    }

    public OaProjectTask detail(Long taskId) { return OaRecordSupport.active(taskMapper.selectById(taskId)); }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存项目任务", spel = "#task")
    public Long saveTask(OaProjectTask task) {
        OaProject project = lockWritableProject(task.getProjectId());
        task.setSubject(OaRecordSupport.text(task.getSubject(), 255, "任务名称"));
        task.setIsMilestoneFlag(OaRecordSupport.flag(task.getIsMilestoneFlag())); task.setIsGroupFlag(OaRecordSupport.flag(task.getIsGroupFlag()));
        if (task.getIsGroupFlag() == 1 && task.getIsMilestoneFlag() == 1) throw new IllegalArgumentException("分组任务不能同时作为里程碑");
        task.setTaskWeight(OaRecordSupport.decimal(task.getTaskWeight() == null ? BigDecimal.valueOf(task.getIsMilestoneFlag() == 1 ? 3 : 1) : task.getTaskWeight(), 6, 2, false, "任务权重"));
        if (task.getTaskWeight().signum() == 0) throw new IllegalArgumentException("任务权重必须大于0");
        task.setPlannedHours(OaRecordSupport.decimal(OaRecordSupport.zero(task.getPlannedHours()), 10, 2, false, "计划工时"));
        task.setProgress(OaRecordSupport.decimal(OaRecordSupport.zero(task.getProgress()), 6, 2, false, "任务进度"));
        if (task.getProgress().compareTo(BigDecimal.valueOf(100)) > 0) throw new IllegalArgumentException("进度不能超过100");
        if (task.getPlannedStart() != null && task.getPlannedEnd() != null && task.getPlannedStart().isAfter(task.getPlannedEnd())) throw new IllegalArgumentException("计划结束不能早于开始");
        task.setPriority(task.getPriority() == null ? 1 : task.getPriority());
        if (task.getPriority() < 0 || task.getPriority() > 2) throw new IllegalArgumentException("优先级无效");
        task.setSortNo(task.getSortNo() == null ? 0 : task.getSortNo());
        if (task.getParentTaskId() != null && task.getParentTaskId() == 0) task.setParentTaskId(null);
        if (task.getAssigneeId() != null) {
            OaIdentityReference person = OaRecordSupport.require(identities.user(task.getAssigneeId(), OaRecordSupport.tenantId()), "负责人不属于当前租户"); task.setAssigneeName(person.getName());
        } else task.setAssigneeName(null);
        OaProjectTask previous = task.getTaskId() == null ? null : OaRecordSupport.active(taskMapper.selectForUpdate(task.getTaskId(), OaRecordSupport.tenantId()));
        if (previous == null) {
            OaRecordSupport.create(task, "taskId"); task.setTaskNo(task.getTaskNo() == null ? "TASK-" + UUID.randomUUID().toString().replace("-", "") : OaRecordSupport.text(task.getTaskNo(), 50, "任务编号"));
            task.setOpeningActualHours(BigDecimal.ZERO);
            task.setActualHours(BigDecimal.ZERO); task.setActualStart(null); task.setActualEnd(null); task.setBaselineStart(task.getPlannedStart()); task.setBaselineEnd(task.getPlannedEnd());
        } else {
            OaRecordSupport.same(previous.getProjectId(), task.getProjectId(), "任务不能更换项目"); OaRecordSupport.update(task, previous);
            task.setOpeningActualHours(OaRecordSupport.zero(previous.getOpeningActualHours()));
            task.setActualHours(previous.getActualHours()); task.setBaselineStart(previous.getBaselineStart()); task.setBaselineEnd(previous.getBaselineEnd());
            task.setActualStart(previous.getActualStart()); task.setActualEnd(previous.getActualEnd());
            if (task.getIsGroupFlag() == 1 && timesheetDetailMapper.selectCount(new LambdaQueryWrapper<OaTimesheetDetail>().eq(OaTimesheetDetail::getTaskId, task.getTaskId()).eq(OaTimesheetDetail::getDeleted, 0)) > 0) throw new IllegalArgumentException("已有工时的任务不能变成分组");
        }
        task.setStatus(OaRecordSupport.code(task.getStatus(), "NOT_STARTED", Set.of("NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "BLOCKED")));
        if (task.getIsGroupFlag() == 1) { task.setProgress(previous == null ? BigDecimal.ZERO : previous.getProgress()); task.setStatus(previous == null ? "NOT_STARTED" : previous.getStatus()); }
        else if ("COMPLETED".equals(task.getStatus()) || task.getProgress().compareTo(BigDecimal.valueOf(100)) == 0) { task.setStatus("COMPLETED"); task.setProgress(BigDecimal.valueOf(100)); if (task.getActualEnd() == null) task.setActualEnd(LocalDateTime.now()); }
        else if (!"CANCELLED".equals(task.getStatus())) task.setActualEnd(null);
        if (task.getProgress().signum() > 0 || Set.of("IN_PROGRESS", "COMPLETED").contains(task.getStatus())) {
            if (task.getActualStart() == null) task.setActualStart(LocalDateTime.now());
            warnDependencies(task);
        }
        task.setLevelPath(previous == null ? "/" : previous.getLevelPath());
        if (previous == null) OaRecordSupport.saved(taskMapper.insert(task)); else OaRecordSupport.saved(taskMapper.updateById(task));
        taskMapper.update(null, new LambdaUpdateWrapper<OaProjectTask>().eq(OaProjectTask::getTaskId, task.getTaskId()).set(OaProjectTask::getParentTaskId, task.getParentTaskId()).set(OaProjectTask::getActualEnd, task.getActualEnd()));
        refreshTree(project.getProjectId()); execution.syncProjectStatus(project.getProjectId(), OaRecordSupport.userName()); return task.getTaskId();
    }

    private void warnDependencies(OaProjectTask task) {
        if (task.getTaskId() == null) return;
        for (OaProjectDependency edge : dependencies(task.getProjectId())) {
            if (!Objects.equals(edge.getSuccessorTaskId(), task.getTaskId())) continue;
            OaProjectTask predecessor = detail(edge.getPredecessorTaskId());
            if ("FINISH_TO_FINISH".equals(edge.getDependencyType()) && !"COMPLETED".equals(task.getStatus())) continue;
            LocalDateTime prerequisite = "START_TO_START".equals(edge.getDependencyType()) ? predecessor.getActualStart() : predecessor.getActualEnd();
            LocalDateTime actual = "FINISH_TO_FINISH".equals(edge.getDependencyType()) ? task.getActualEnd() : task.getActualStart();
            boolean unsatisfied = prerequisite == null || actual == null || actual.isBefore(prerequisite.plusDays(edge.getLagDays()));
            if (unsatisfied) businessRuleService.evaluateBlock("oa.project.dependency.unsatisfied", "PROJECT_TASK", task.getTaskId(), false, "前置任务或间隔天数尚未满足依赖：" + predecessor.getSubject());
        }
    }

    private void refreshTree(Long projectId) {
        List<OaProjectTask> tasks = list(projectId); OaProjectTaskGraph.assignPaths(tasks);
        tasks.sort(Comparator.comparingInt((OaProjectTask task) -> task.getLevelPath().length()).reversed());
        for (OaProjectTask task : tasks) {
            if (Integer.valueOf(1).equals(task.getIsGroupFlag())) {
                List<OaProjectTask> children = tasks.stream().filter(child -> Objects.equals(child.getParentTaskId(), task.getTaskId())).toList();
                task.setActualHours(OaRecordSupport.decimal(children.stream().map(child -> OaRecordSupport.zero(child.getActualHours()))
                        .reduce(OaRecordSupport.zero(task.getOpeningActualHours()), BigDecimal::add), 10, 2, false, "分组实际工时"));
                BigDecimal weights = children.stream().map(OaProjectTask::getTaskWeight).reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal weighted = children.stream().map(child -> child.getProgress().multiply(child.getTaskWeight())).reduce(BigDecimal.ZERO, BigDecimal::add);
                task.setProgress(weights.signum() == 0 ? BigDecimal.ZERO : weighted.divide(weights, 2, RoundingMode.HALF_UP));
                task.setStatus(!children.isEmpty() && children.stream().allMatch(child -> "COMPLETED".equals(child.getStatus())) ? "COMPLETED" : task.getProgress().signum() > 0 ? "IN_PROGRESS" : "NOT_STARTED");
                task.setActualStart(children.stream().map(OaProjectTask::getActualStart).filter(Objects::nonNull).min(LocalDateTime::compareTo).orElse(null));
                task.setActualEnd("COMPLETED".equals(task.getStatus()) ? children.stream().map(OaProjectTask::getActualEnd).filter(Objects::nonNull).max(LocalDateTime::compareTo).orElse(task.getActualEnd()) : null);
            }
            OaRecordSupport.touch(task);
            LambdaUpdateWrapper<OaProjectTask> update = new LambdaUpdateWrapper<OaProjectTask>()
                    .eq(OaProjectTask::getTaskId, task.getTaskId()).eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaProjectTask::getDeleted, 0).eq(OaProjectTask::getVersion, task.getVersion())
                    .set(OaProjectTask::getLevelPath, task.getLevelPath()).set(OaProjectTask::getVersion, task.getVersion() + 1)
                    .set(OaProjectTask::getUpdateBy, task.getUpdateBy()).set(OaProjectTask::getUpdateTime, task.getUpdateTime());
            if (Integer.valueOf(1).equals(task.getIsGroupFlag())) {
                update.set(OaProjectTask::getActualHours, task.getActualHours()).set(OaProjectTask::getProgress, task.getProgress())
                        .set(OaProjectTask::getStatus, task.getStatus()).set(OaProjectTask::getActualStart, task.getActualStart())
                        .set(OaProjectTask::getActualEnd, task.getActualEnd());
            }
            OaRecordSupport.saved(taskMapper.update(null, update));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "调整项目任务树", spel = "#projectId")
    public void updateTree(Long projectId, List<ProjectWbsTreeNodeDTO> nodes) {
        lockWritableProject(projectId);
        List<OaProjectTask> tasks = list(projectId);
        if (nodes == null || nodes.size() != tasks.size()) throw new IllegalArgumentException("任务树已变化，请刷新完整任务树后重试");
        Map<Long, OaProjectTask> lookup = new HashMap<>();
        for (OaProjectTask task : tasks) lookup.put(task.getTaskId(), task);
        Set<Long> seen = new HashSet<>();
        boolean changed = false;
        for (ProjectWbsTreeNodeDTO node : nodes) {
            if (node == null || node.getTaskId() == null || !seen.add(node.getTaskId())) throw new IllegalArgumentException("任务编号不能为空或重复");
            OaProjectTask task = OaRecordSupport.require(lookup.get(node.getTaskId()), "任务不属于当前项目");
            if (node.getVersion() == null || !node.getVersion().equals(task.getVersion())) throw new IllegalArgumentException("任务树已变化，请刷新完整任务树后重试");
            if (node.getSortOrder() == null || node.getSortOrder() < 0) throw new IllegalArgumentException("任务顺序必须为非负整数");
            Long parentId = node.getParentId() == null || node.getParentId() == 0 ? null : node.getParentId();
            changed |= !Objects.equals(task.getParentTaskId(), parentId) || !Objects.equals(task.getSortNo(), node.getSortOrder());
            task.setParentTaskId(parentId); task.setSortNo(node.getSortOrder());
        }
        OaProjectTaskGraph.assignPaths(tasks);
        if (!changed) return;
        for (OaProjectTask task : tasks) {
            OaRecordSupport.touch(task);
            OaRecordSupport.saved(taskMapper.update(null, new LambdaUpdateWrapper<OaProjectTask>()
                    .eq(OaProjectTask::getTaskId, task.getTaskId()).eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaProjectTask::getDeleted, 0).eq(OaProjectTask::getVersion, task.getVersion())
                    .set(OaProjectTask::getParentTaskId, task.getParentTaskId()).set(OaProjectTask::getSortNo, task.getSortNo())
                    .set(OaProjectTask::getLevelPath, task.getLevelPath()).set(OaProjectTask::getVersion, task.getVersion() + 1)
                    .set(OaProjectTask::getUpdateBy, task.getUpdateBy()).set(OaProjectTask::getUpdateTime, task.getUpdateTime())));
        }
        refreshTree(projectId); execution.syncProjectStatus(projectId, OaRecordSupport.userName());
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除项目任务", highRisk = true, spel = "#ids")
    public void removeTasks(List<Long> ids) {
        for (Long id : ids) {
            OaProjectTask reference = detail(id); lockWritableProject(reference.getProjectId());
            OaProjectTask task = OaRecordSupport.active(taskMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
            if (OaRecordSupport.zero(task.getOpeningActualHours()).signum() > 0) throw new IllegalArgumentException("含期初工时的任务不可删除");
            if (taskMapper.selectCount(new LambdaQueryWrapper<OaProjectTask>().eq(OaProjectTask::getParentTaskId, id).eq(OaProjectTask::getDeleted, 0)) > 0
                    || timesheetDetailMapper.selectCount(new LambdaQueryWrapper<OaTimesheetDetail>().eq(OaTimesheetDetail::getTaskId, id).eq(OaTimesheetDetail::getDeleted, 0)) > 0
                    || dependencyMapper.selectCount(new LambdaQueryWrapper<OaProjectDependency>().eq(OaProjectDependency::getDeleted, 0).and(query -> query.eq(OaProjectDependency::getPredecessorTaskId, id).or().eq(OaProjectDependency::getSuccessorTaskId, id))) > 0
                    || workTaskMapper.selectCount(new LambdaQueryWrapper<WorkTask>().eq(WorkTask::getMilestoneId, id).eq(WorkTask::getDeleted, 0)) > 0) throw new IllegalArgumentException("任务仍被子任务、工时或依赖引用");
            OaRecordSupport.touch(task);
            OaRecordSupport.saved(taskMapper.update(null, new LambdaUpdateWrapper<OaProjectTask>()
                    .eq(OaProjectTask::getTaskId, id).eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaProjectTask::getDeleted, 0).eq(OaProjectTask::getVersion, task.getVersion())
                    .set(OaProjectTask::getDeleted, 1).set(OaProjectTask::getVersion, task.getVersion() + 1)
                    .set(OaProjectTask::getUpdateBy, task.getUpdateBy()).set(OaProjectTask::getUpdateTime, task.getUpdateTime())));
            refreshTree(task.getProjectId()); execution.syncProjectStatus(task.getProjectId(), OaRecordSupport.userName());
        }
    }

    public List<OaProjectDependency> dependencies(Long projectId) {
        OaRecordSupport.active(projectMapper.selectById(projectId));
        return dependencyMapper.selectList(new LambdaQueryWrapper<OaProjectDependency>().eq(OaProjectDependency::getTenantId, OaRecordSupport.tenantId()).eq(OaProjectDependency::getProjectId, projectId).eq(OaProjectDependency::getDeleted, 0));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存项目任务依赖", spel = "#edge")
    public Long saveDependency(OaProjectDependency edge) {
        lockWritableProject(edge.getProjectId());
        OaRecordSupport.same(detail(edge.getPredecessorTaskId()).getProjectId(), edge.getProjectId(), "前置任务不属于当前项目");
        OaRecordSupport.same(detail(edge.getSuccessorTaskId()).getProjectId(), edge.getProjectId(), "后置任务不属于当前项目");
        edge.setDependencyType(OaRecordSupport.code(edge.getDependencyType(), "FINISH_TO_START", Set.of("FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH")));
        edge.setLagDays(edge.getLagDays() == null ? 0 : edge.getLagDays());
        List<OaProjectDependency> proposed = new ArrayList<>(dependencies(edge.getProjectId()));
        proposed.removeIf(item -> Objects.equals(item.getDependencyId(), edge.getDependencyId()));
        if (proposed.stream().anyMatch(item -> Objects.equals(item.getPredecessorTaskId(), edge.getPredecessorTaskId())
                && Objects.equals(item.getSuccessorTaskId(), edge.getSuccessorTaskId())
                && Objects.equals(item.getDependencyType(), edge.getDependencyType()))) throw new IllegalArgumentException("相同类型的任务依赖已存在");
        proposed.add(edge); OaProjectTaskGraph.validateDependencies(proposed);
        if (edge.getDependencyId() == null) { OaRecordSupport.create(edge, "dependencyId"); OaRecordSupport.saved(dependencyMapper.insert(edge)); }
        else { OaProjectDependency previous = OaRecordSupport.active(dependencyMapper.selectForUpdate(edge.getDependencyId(), OaRecordSupport.tenantId())); OaRecordSupport.same(previous.getProjectId(), edge.getProjectId(), "依赖不能更换项目"); OaRecordSupport.update(edge, previous); OaRecordSupport.saved(dependencyMapper.updateById(edge)); }
        return edge.getDependencyId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除项目任务依赖", highRisk = true, spel = "#ids")
    public void removeDependencies(List<Long> ids) {
        for (Long id : ids) {
            OaProjectDependency reference = OaRecordSupport.active(dependencyMapper.selectById(id));
            lockWritableProject(reference.getProjectId());
            OaProjectDependency edge = OaRecordSupport.active(dependencyMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
            OaRecordSupport.touch(edge);
            OaRecordSupport.saved(dependencyMapper.update(null, new LambdaUpdateWrapper<OaProjectDependency>()
                    .eq(OaProjectDependency::getDependencyId, id).eq(OaProjectDependency::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaProjectDependency::getDeleted, 0).eq(OaProjectDependency::getVersion, edge.getVersion())
                    .set(OaProjectDependency::getDeleted, 1).set(OaProjectDependency::getVersion, edge.getVersion() + 1)
                    .set(OaProjectDependency::getUpdateBy, edge.getUpdateBy()).set(OaProjectDependency::getUpdateTime, edge.getUpdateTime())));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存项目基线", spel = "#projectId")
    public void snapshotBaseline(Long projectId) {
        OaProject project = lockWritableProject(projectId);
        for (OaProjectTask task : list(projectId)) OaRecordSupport.saved(taskMapper.update(null, new LambdaUpdateWrapper<OaProjectTask>().eq(OaProjectTask::getTaskId, task.getTaskId())
                .eq(OaProjectTask::getTenantId, OaRecordSupport.tenantId()).eq(OaProjectTask::getVersion, task.getVersion()).set(OaProjectTask::getVersion, task.getVersion() + 1)
                .set(OaProjectTask::getBaselineStart, task.getPlannedStart()).set(OaProjectTask::getBaselineEnd, task.getPlannedEnd()).set(OaProjectTask::getUpdateBy, OaRecordSupport.userName()).set(OaProjectTask::getUpdateTime, LocalDateTime.now())));
        project.setBaselineVersion(project.getBaselineVersion() == null ? 1 : project.getBaselineVersion() + 1); OaRecordSupport.touch(project); OaRecordSupport.saved(projectMapper.updateById(project));
    }
}

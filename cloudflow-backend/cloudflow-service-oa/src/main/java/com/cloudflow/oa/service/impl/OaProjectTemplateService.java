package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.ProjectTemplateSaveDTO;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
public class OaProjectTemplateService {
    private final OaProjectTemplateMapper templates;
    private final OaProjectTemplateTaskMapper templateTasks;
    private final OaProjectMapper projects;
    private final OaProjectMemberMapper members;
    private final OaProjectTaskService tasks;

    public List<OaProjectTemplate> list() {
        return templates.selectList(new LambdaQueryWrapper<OaProjectTemplate>().eq(OaProjectTemplate::getTenantId, OaRecordSupport.tenantId()).eq(OaProjectTemplate::getDeleted, 0).orderByAsc(OaProjectTemplate::getTemplateName));
    }

    public ProjectTemplateSaveDTO detail(Long id) {
        ProjectTemplateSaveDTO result = new ProjectTemplateSaveDTO(); result.setTemplate(OaRecordSupport.active(templates.selectById(id)));
        result.setTasks(templateTasks.selectList(new LambdaQueryWrapper<OaProjectTemplateTask>().eq(OaProjectTemplateTask::getTenantId, OaRecordSupport.tenantId())
                .eq(OaProjectTemplateTask::getTemplateId, id).eq(OaProjectTemplateTask::getDeleted, 0).orderByAsc(OaProjectTemplateTask::getSortNo, OaProjectTemplateTask::getTemplateTaskId)));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存项目模板", spel = "#request.template.templateId")
    public Long save(ProjectTemplateSaveDTO request) {
        OaProjectTemplate template = OaRecordSupport.require(request.getTemplate(), "模板不能为空");
        template.setTemplateCode(OaRecordSupport.text(template.getTemplateCode(), 50, "模板编码")); template.setTemplateName(OaRecordSupport.text(template.getTemplateName(), 200, "模板名称"));
        template.setStatus(OaRecordSupport.code(template.getStatus(), "ACTIVE", Set.of("ACTIVE", "DISABLED")));
        if (template.getTemplateId() == null) { OaRecordSupport.create(template, "templateId"); OaRecordSupport.saved(templates.insert(template)); }
        else { OaProjectTemplate previous = OaRecordSupport.active(templates.selectForUpdate(template.getTemplateId(), OaRecordSupport.tenantId())); OaRecordSupport.update(template, previous); OaRecordSupport.saved(templates.updateById(template)); }
        List<OaProjectTemplateTask> items = OaRecordSupport.require(request.getTasks(), "模板任务不能为空");
        if (items.isEmpty() || items.size() > 500) throw new IllegalArgumentException("模板任务数必须为1至500");
        Map<Long, OaProjectTemplateTask> byTemporaryId = new LinkedHashMap<>(); long temporary = -1;
        for (OaProjectTemplateTask item : items) {
            Long temporaryId = item.getTemplateTaskId() == null ? temporary-- : item.getTemplateTaskId();
            if (byTemporaryId.put(temporaryId, item) != null) throw new IllegalArgumentException("模板任务ID重复");
            item.setTemplateTaskId(temporaryId); item.setTemplateId(template.getTemplateId());
            if (Long.valueOf(0).equals(item.getParentTemplateTaskId())) item.setParentTemplateTaskId(null);
            item.setSubject(OaRecordSupport.text(item.getSubject(), 255, "任务名称")); item.setIsMilestoneFlag(OaRecordSupport.flag(item.getIsMilestoneFlag()));
            item.setTaskWeight(OaRecordSupport.decimal(item.getTaskWeight() == null ? BigDecimal.valueOf(item.getIsMilestoneFlag() == 1 ? 3 : 1) : item.getTaskWeight(), 6, 2, false, "任务权重"));
            if (item.getTaskWeight().signum() == 0) throw new IllegalArgumentException("任务权重必须大于0");
            item.setPlannedHours(OaRecordSupport.decimal(OaRecordSupport.zero(item.getPlannedHours()), 10, 2, false, "计划工时"));
            item.setStartOffsetDays(item.getStartOffsetDays() == null ? 0 : item.getStartOffsetDays()); item.setDurationDays(item.getDurationDays() == null ? 1 : item.getDurationDays());
            if (item.getDurationDays() < 0 || item.getDurationDays() == 0 && item.getIsMilestoneFlag() == 0) throw new IllegalArgumentException("普通任务持续天数必须为正数");
            item.setSortNo(item.getSortNo() == null ? 0 : item.getSortNo());
        }
        validatePaths(items);
        templateTasks.update(null, new LambdaUpdateWrapper<OaProjectTemplateTask>().eq(OaProjectTemplateTask::getTenantId, OaRecordSupport.tenantId()).eq(OaProjectTemplateTask::getTemplateId, template.getTemplateId()).eq(OaProjectTemplateTask::getDeleted, 0).set(OaProjectTemplateTask::getDeleted, 1));
        Map<Long, Long> mapping = new HashMap<>();
        for (Map.Entry<Long, OaProjectTemplateTask> entry : byTemporaryId.entrySet()) {
            OaProjectTemplateTask item = entry.getValue(); OaRecordSupport.create(item, "templateTaskId"); item.setLevelPath("/"); OaRecordSupport.saved(templateTasks.insert(item)); mapping.put(entry.getKey(), item.getTemplateTaskId());
        }
        for (OaProjectTemplateTask item : items) if (item.getParentTemplateTaskId() != null) item.setParentTemplateTaskId(mapping.get(item.getParentTemplateTaskId()));
        validatePaths(items);
        for (OaProjectTemplateTask item : items) OaRecordSupport.saved(templateTasks.updateById(item));
        return template.getTemplateId();
    }

    private void validatePaths(List<OaProjectTemplateTask> items) {
        Set<Long> parents = new HashSet<>(); for (OaProjectTemplateTask item : items) if (item.getParentTemplateTaskId() != null) parents.add(item.getParentTemplateTaskId());
        List<OaProjectTask> nodes = new ArrayList<>();
        for (OaProjectTemplateTask item : items) {
            if (parents.contains(item.getTemplateTaskId()) && item.getIsMilestoneFlag() == 1) throw new IllegalArgumentException("里程碑不能包含子任务");
            OaProjectTask node = new OaProjectTask(); node.setTaskId(item.getTemplateTaskId()); node.setProjectId(item.getTemplateId()); node.setParentTaskId(item.getParentTemplateTaskId()); node.setIsGroupFlag(parents.contains(item.getTemplateTaskId()) ? 1 : 0); nodes.add(node);
        }
        OaProjectTaskGraph.assignPaths(nodes);
        Map<Long, String> paths = new HashMap<>(); for (OaProjectTask node : nodes) paths.put(node.getTaskId(), node.getLevelPath());
        for (OaProjectTemplateTask item : items) item.setLevelPath(paths.get(item.getTemplateTaskId()));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "项目应用任务模板", spel = "#projectId")
    public void applyTemplate(Long templateId, Long projectId) {
        OaProject project = OaRecordSupport.active(projects.selectForUpdate(projectId, OaRecordSupport.tenantId()));
        OaProjectTemplate template = OaRecordSupport.active(templates.selectForUpdate(templateId, OaRecordSupport.tenantId()));
        if (!"ACTIVE".equals(template.getStatus())) throw new IllegalArgumentException("模板已停用");
        if (!tasks.list(projectId).isEmpty()) throw new IllegalArgumentException("请在空任务树上应用模板，避免重复创建");
        LocalDate start = OaRecordSupport.require(project.getStartDate(), "请先设置项目开始日期");
        List<OaProjectTemplateTask> source = detail(templateId).getTasks(); source.sort(Comparator.comparingInt(item -> item.getLevelPath().length()));
        Set<Long> parents = source.stream().map(OaProjectTemplateTask::getParentTemplateTaskId).filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        List<OaProjectMember> team = members.selectList(new LambdaQueryWrapper<OaProjectMember>().eq(OaProjectMember::getTenantId, OaRecordSupport.tenantId()).eq(OaProjectMember::getProjectId, projectId).eq(OaProjectMember::getDeleted, 0));
        Map<Long, Long> mapping = new HashMap<>();
        for (OaProjectTemplateTask item : source) {
            OaProjectTask task = new OaProjectTask(); task.setProjectId(projectId); task.setSubject(item.getSubject()); task.setTaskTypeId(item.getTaskTypeId()); task.setIsMilestoneFlag(item.getIsMilestoneFlag()); task.setIsGroupFlag(parents.contains(item.getTemplateTaskId()) ? 1 : 0);
            task.setParentTaskId(item.getParentTemplateTaskId() == null ? null : mapping.get(item.getParentTemplateTaskId())); task.setTaskWeight(item.getTaskWeight()); task.setPlannedHours(item.getPlannedHours()); task.setSortNo(item.getSortNo());
            task.setPlannedStart(start.plusDays(item.getStartOffsetDays()).atStartOfDay()); task.setPlannedEnd(item.getDurationDays() == 0 ? task.getPlannedStart() : task.getPlannedStart().plusDays(item.getDurationDays()).minusSeconds(1));
            if (item.getAssigneeRole() != null) {
                List<OaProjectMember> matching = team.stream().filter(member -> item.getAssigneeRole().equals(member.getRoleCode())).toList();
                if (matching.size() == 1) task.setAssigneeId(matching.get(0).getUserId());
                else if ("OWNER".equals(item.getAssigneeRole())) task.setAssigneeId(project.getOwnerId());
            }
            mapping.put(item.getTemplateTaskId(), tasks.saveTask(task));
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "从项目保存任务模板", spel = "#projectId")
    public Long saveFromProject(Long projectId, OaProjectTemplate template) {
        OaProject project = OaRecordSupport.active(projects.selectForUpdate(projectId, OaRecordSupport.tenantId()));
        LocalDate start = OaRecordSupport.require(project.getStartDate(), "项目开始日期不能为空");
        ProjectTemplateSaveDTO request = new ProjectTemplateSaveDTO(); request.setTemplate(template);
        List<OaProjectTemplateTask> items = new ArrayList<>();
        for (OaProjectTask task : tasks.list(projectId)) {
            OaProjectTemplateTask item = new OaProjectTemplateTask(); item.setTemplateTaskId(task.getTaskId()); item.setParentTemplateTaskId(task.getParentTaskId()); item.setSubject(task.getSubject()); item.setTaskNo(task.getTaskNo()); item.setTaskTypeId(task.getTaskTypeId());
            item.setIsMilestoneFlag(task.getIsMilestoneFlag()); item.setTaskWeight(task.getTaskWeight()); item.setPlannedHours(task.getPlannedHours()); item.setSortNo(task.getSortNo());
            LocalDate planned = task.getPlannedStart() == null ? start : task.getPlannedStart().toLocalDate();
            item.setStartOffsetDays(Math.toIntExact(ChronoUnit.DAYS.between(start, planned)));
            item.setDurationDays(task.getIsMilestoneFlag() == 1 ? 0 : task.getPlannedEnd() == null ? 1 : Math.max(1, Math.toIntExact(ChronoUnit.DAYS.between(planned, task.getPlannedEnd().toLocalDate())) + 1));
            if (Objects.equals(task.getAssigneeId(), project.getOwnerId())) item.setAssigneeRole("OWNER"); items.add(item);
        }
        request.setTasks(items); return save(request);
    }
}

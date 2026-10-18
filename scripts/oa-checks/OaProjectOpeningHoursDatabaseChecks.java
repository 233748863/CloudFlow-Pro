package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.OaProjectTemplate;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaProjectTaskMapper;
import java.util.List;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;
import static com.cloudflow.oa.service.impl.OaProjectContractDatabaseChecks.project;

public final class OaProjectOpeningHoursDatabaseChecks {
    static void run(OaOperationsDatabaseChecks fixture) {
        identity(100000L, 1L);
        OaProject project = project(fixture, "-opening", 1L);
        OaProjectTask root = task(fixture, project, "主分组", null, true, "2.25");
        OaProjectTask group = task(fixture, project, "子分组", root.getTaskId(), true, "3.50");
        OaProjectTask leaf = task(fixture, project, "历史任务", group.getTaskId(), false, "4.75");
        task(fixture, project, "独立任务", null, false, "1.50");
        OaProjectTask deleted = task(fixture, project, "已删除历史任务", null, false, "100");
        fixture.jdbc.update("UPDATE oa_project_task SET deleted=1 WHERE task_id=?", deleted.getTaskId());
        task(fixture, project(fixture, "-opening-other-project", 1L), "其他项目", null, false, "200");
        identity(100001L, 1L);
        OaProject foreign = project(fixture, "-opening-other-tenant", 1L);
        task(fixture, foreign, "其他租户", null, false, "300");
        identity(100000L, 1L);
        OaProjectAccountingService accounting = fixture.bean(OaProjectAccountingService.class);
        OaProjectTaskService service = fixture.bean(OaProjectTaskService.class);
        for (int attempt = 0; attempt < 2; attempt++) {
            accounting.recalculate(project.getProjectId());
            decimal("12", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getActualHours(), "project opening hours counted once and isolated");
            decimal("10.50", service.detail(root.getTaskId()).getActualHours(), "root includes own opening and descendants once");
            decimal("8.25", service.detail(group.getTaskId()).getActualHours(), "nested group retains independent opening");
            decimal("4.75", service.detail(leaf.getTaskId()).getActualHours(), "historical leaf survives repeated recalculation");
        }
        decimal("0", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getLaborCostAmount(), "opening hours do not manufacture labor cost");
        fails(IllegalArgumentException.class, () -> accounting.recalculate(foreign.getProjectId()), "opening recalculation rejects foreign tenant");
        OaProjectTask edited = service.detail(leaf.getTaskId());
        edited.setOpeningActualHours(number("999")); edited.setActualHours(number("999")); edited.setParentTaskId(root.getTaskId());
        service.saveTask(edited);
        decimal("4.75", service.detail(leaf.getTaskId()).getOpeningActualHours(), "normal editing cannot overwrite historical opening");
        decimal("4.75", service.detail(leaf.getTaskId()).getActualHours(), "normal editing cannot overwrite cumulative hours");
        decimal("3.50", service.detail(group.getTaskId()).getActualHours(), "empty former parent retains own opening after reparenting");
        decimal("10.50", service.detail(root.getTaskId()).getActualHours(), "reparenting does not duplicate descendant hours");
        fails(IllegalArgumentException.class, () -> service.removeTasks(List.of(leaf.getTaskId())), "historical opening blocks task deletion");
        OaProjectTask injected = new OaProjectTask(); injected.setProjectId(project.getProjectId()); injected.setSubject("新增任务");
        injected.setOpeningActualHours(number("999")); injected.setActualHours(number("999"));
        Long createdId = service.saveTask(injected);
        decimal("0", service.detail(createdId).getOpeningActualHours(), "new task opening is server-controlled zero");
        decimal("0", service.detail(createdId).getActualHours(), "new task cannot inject cumulative hours");
        OaProjectTemplate template = new OaProjectTemplate(); template.setTemplateCode(fixture.marker + "-opening"); template.setTemplateName("期初工时不复制");
        Long templateId = fixture.bean(OaProjectTemplateService.class).saveFromProject(project.getProjectId(), template);
        OaProject destination = project(fixture, "-opening-template", 1L);
        fixture.bean(OaProjectTemplateService.class).applyTemplate(templateId, destination.getProjectId());
        equal(true, service.list(destination.getProjectId()).stream().allMatch(item -> item.getOpeningActualHours().signum() == 0 && item.getActualHours().signum() == 0), "template does not copy historical hours");
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=99999999.99 WHERE task_id=?", leaf.getTaskId());
        fails(IllegalArgumentException.class, () -> accounting.recalculate(project.getProjectId()), "project hours overflow rejected before persistence");
        decimal("12", fixture.mapper(OaProjectMapper.class).selectById(project.getProjectId()).getActualHours(), "overflow leaves previous project totals intact");
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=4.75 WHERE task_id=?", leaf.getTaskId());
    }

    private static OaProjectTask task(OaOperationsDatabaseChecks fixture, OaProject project, String subject, Long parentId, boolean group, String opening) {
        OaProjectTask task = new OaProjectTask(); task.setProjectId(project.getProjectId()); task.setSubject(subject); task.setParentTaskId(parentId); task.setIsGroupFlag(group ? 1 : 0);
        Long taskId = fixture.bean(OaProjectTaskService.class).saveTask(task);
        fixture.jdbc.update("UPDATE oa_project_task SET opening_actual_hours=? WHERE task_id=?", number(opening), taskId);
        return fixture.mapper(OaProjectTaskMapper.class).selectById(taskId);
    }
}

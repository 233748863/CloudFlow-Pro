package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectMember;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.OaProjectRisk;

import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.vo.ProjectCostSummaryVO;
import com.cloudflow.oa.domain.vo.ProjectDetailVO;
import com.cloudflow.oa.service.IOaProjectService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/project")
@RequiredArgsConstructor
public class ProjectController {

    private final IOaProjectService oaProjectService;

    @GetMapping("/list")
    @SaCheckPermission("oa:project:list")
    public R<PageResult<OaProject>> list(OaProject query, PageQuery pageQuery) {
        return R.ok(oaProjectService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:project:list")
    public R<OaProject> getInfo(@PathVariable("id") Long id) {
        OaProject project = oaProjectService.getById(id);
        return project == null || !Integer.valueOf(0).equals(project.getDeleted()) ? R.fail(404, "项目不存在") : R.ok(project);
    }

    @GetMapping("/{id}/detail")
    @SaCheckPermission("oa:project:list")
    public R<ProjectDetailVO> getDetail(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.getProjectDetail(id));
    }

    @GetMapping("/{id}/members")
    @SaCheckPermission("oa:project:list")
    public R<List<OaProjectMember>> members(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.listMembers(id));
    }

    @GetMapping("/{id}/milestones")
    @SaCheckPermission("oa:project:list")
    public R<List<OaProjectTask>> milestones(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.listMilestones(id));
    }

    @GetMapping("/{id}/wbs")
    @SaCheckPermission("oa:project:list")
    public R<List<OaProjectTask>> wbs(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.listWbsTasks(id));
    }

    @GetMapping("/{id}/dependency/list")
    @SaCheckPermission("oa:project:list")
    public R<List<OaProjectDependency>> dependencies(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.listDependencies(id));
    }

    @GetMapping("/{id}/risks")
    @SaCheckPermission("oa:project:list")
    public R<List<OaProjectRisk>> risks(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.listRisks(id));
    }

    @GetMapping("/{id}/cost-summary")
    @SaCheckPermission("oa:project:list")
    public R<ProjectCostSummaryVO> costSummary(@PathVariable("id") Long id) {
        return R.ok(oaProjectService.getCostSummary(id));
    }

    @SysLog("新增项目")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:project:add")
    public R<Long> add(@RequestBody OaProject project) {
        return R.ok(oaProjectService.createProject(project));
    }

    @SysLog("新增项目成员")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/member")
    @SaCheckPermission("oa:project:edit")
    public R<Void> addMember(@RequestBody OaProjectMember member) {
        return R.result(oaProjectService.addMember(member));
    }

    @SysLog("修改项目成员")
    @PutMapping("/member")
    @SaCheckPermission("oa:project:edit")
    public R<Void> editMember(@RequestBody OaProjectMember member) {
        return R.result(oaProjectService.updateMember(member));
    }

    @SysLog("删除项目成员")
    @DeleteMapping("/member/{ids}")
    @SaCheckPermission("oa:project:edit")
    public R<Void> removeMember(@PathVariable("ids") List<Long> ids) {
        return R.result(oaProjectService.removeMembers(ids));
    }

    @SysLog("新增项目里程碑")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/milestone")
    @SaCheckPermission("oa:project:edit")
    public R<Void> addMilestone(@RequestBody OaProjectTask milestone) {
        return R.result(oaProjectService.addMilestone(milestone));
    }

    @SysLog("修改项目里程碑")
    @PutMapping("/milestone")
    @SaCheckPermission("oa:project:edit")
    public R<Void> editMilestone(@RequestBody OaProjectTask milestone) {
        return R.result(oaProjectService.updateMilestone(milestone));
    }

    @SysLog("删除项目里程碑")
    @DeleteMapping("/milestone/{ids}")
    @SaCheckPermission("oa:project:edit")
    public R<Void> removeMilestone(@PathVariable("ids") List<Long> ids) {
        return R.result(oaProjectService.removeMilestones(ids));
    }

    @SysLog("新增项目风险")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/risk")
    @SaCheckPermission("oa:project:edit")
    public R<Void> addRisk(@RequestBody OaProjectRisk risk) {
        return R.result(oaProjectService.addRisk(risk));
    }

    @SysLog("修改项目风险")
    @PutMapping("/risk")
    @SaCheckPermission("oa:project:edit")
    public R<Void> editRisk(@RequestBody OaProjectRisk risk) {
        return R.result(oaProjectService.updateRisk(risk));
    }

    @SysLog("删除项目风险")
    @DeleteMapping("/risk/{ids}")
    @SaCheckPermission("oa:project:edit")
    public R<Void> removeRisk(@PathVariable("ids") List<Long> ids) {
        return R.result(oaProjectService.removeRisks(ids));
    }

    @SysLog("新增WBS任务")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/wbs")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> addWbs(@RequestBody OaProjectTask task) {
        return R.result(oaProjectService.addWbsTask(task));
    }

    @SysLog("修改WBS任务")
    @PutMapping("/wbs")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> editWbs(@RequestBody OaProjectTask task) {
        return R.result(oaProjectService.updateWbsTask(task));
    }

    @SysLog("批量调整WBS树")
    @PutMapping("/wbs/tree")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> updateWbsTree(@RequestParam("projectId") Long projectId,
                                 @RequestBody List<ProjectWbsTreeNodeDTO> nodes) {
        return R.result(oaProjectService.updateWbsTree(projectId, nodes));
    }

    @SysLog("删除WBS任务")
    @DeleteMapping("/wbs/{ids}")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> removeWbs(@PathVariable("ids") List<Long> ids) {
        return R.result(oaProjectService.removeWbsTasks(ids));
    }

    @SysLog("新增项目依赖")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/dependency")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> addDependency(@RequestBody OaProjectDependency dependency) {
        return R.result(oaProjectService.addDependency(dependency));
    }

    @SysLog("修改项目依赖")
    @PutMapping("/dependency")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> editDependency(@RequestBody OaProjectDependency dependency) {
        return R.result(oaProjectService.updateDependency(dependency));
    }

    @SysLog("删除项目依赖")
    @DeleteMapping("/dependency/{ids}")
    @SaCheckPermission("oa:project:wbs")
    public R<Void> removeDependency(@PathVariable("ids") List<Long> ids) {
        return R.result(oaProjectService.removeDependencies(ids));
    }

    @SysLog("修改项目")
    @PutMapping
    @SaCheckPermission("oa:project:edit")
    public R<Void> edit(@RequestBody OaProject project) {
        return R.result(oaProjectService.updateProject(project));
    }

    @SysLog("提交项目立项")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/submit/{id}")
    @SaCheckPermission("oa:project:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        return R.result(oaProjectService.submitProject(id));
    }

    @SysLog("归档项目")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/archive/{id}")
    @SaCheckPermission("oa:project:archive")
    public R<Void> archive(@PathVariable("id") Long id) {
        return R.result(oaProjectService.archiveProject(id));
    }

    @SysLog("项目基线快照")
    @PostMapping("/{id}/baseline/snapshot")
    @SaCheckPermission("oa:project:baseline")
    public R<Void> snapshotBaseline(@PathVariable("id") Long id) {
        return R.result(oaProjectService.snapshotBaseline(id));
    }

    @SysLog("删除项目")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:project:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            OaProject project = new OaProject();
            project.setProjectId(id);
            project.setDeleted(1);
            oaProjectService.updateById(project);
        }
        return R.ok();
    }
}

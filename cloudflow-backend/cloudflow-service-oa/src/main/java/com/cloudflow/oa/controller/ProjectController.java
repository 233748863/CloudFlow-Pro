package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectMember;
import com.cloudflow.oa.domain.OaProjectMilestone;
import com.cloudflow.oa.domain.OaProjectRisk;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.vo.ProjectCostSummaryVO;
import com.cloudflow.oa.domain.vo.ProjectDetailVO;
import com.cloudflow.oa.service.IOaProjectService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/project")
@SaCheckLogin
@RequiredArgsConstructor
public class ProjectController {

    private final IOaProjectService projectService;

    @GetMapping("/list")
    @SaCheckPermission("office:project:list")
    public R<PageResult<OaProject>> list(OaProject query, PageQuery pageQuery) {
        return R.ok(projectService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("office:project:list")
    public R<OaProject> getInfo(@PathVariable("id") Long id) {
        OaProject project = projectService.getById(id);
        return project == null || !"0".equals(project.getDelFlag()) ? R.fail("项目不存在") : R.ok(project);
    }

    @GetMapping("/{id}/detail")
    @SaCheckPermission("office:project:list")
    public R<ProjectDetailVO> getDetail(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.getProjectDetail(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/members")
    @SaCheckPermission("office:project:list")
    public R<List<OaProjectMember>> members(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.listMembers(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/milestones")
    @SaCheckPermission("office:project:list")
    public R<List<OaProjectMilestone>> milestones(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.listMilestones(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/wbs")
    @SaCheckPermission("office:project:list")
    public R<List<WorkTask>> wbs(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.listWbsTasks(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/dependency/list")
    @SaCheckPermission("office:project:list")
    public R<List<OaProjectDependency>> dependencies(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.listDependencies(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/risks")
    @SaCheckPermission("office:project:list")
    public R<List<OaProjectRisk>> risks(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.listRisks(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/cost-summary")
    @SaCheckPermission("office:project:list")
    public R<ProjectCostSummaryVO> costSummary(@PathVariable("id") Long id) {
        try {
            return R.ok(projectService.getCostSummary(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增项目")
    @PostMapping
    @SaCheckPermission("office:project:add")
    public R<Long> add(@RequestBody OaProject project) {
        try {
            return R.ok(projectService.createProject(project));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增项目成员")
    @PostMapping("/member")
    @SaCheckPermission("office:project:edit")
    public R<Void> addMember(@RequestBody OaProjectMember member) {
        try {
            return R.result(projectService.addMember(member));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改项目成员")
    @PutMapping("/member")
    @SaCheckPermission("office:project:edit")
    public R<Void> editMember(@RequestBody OaProjectMember member) {
        try {
            return R.result(projectService.updateMember(member));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除项目成员")
    @DeleteMapping("/member/{ids}")
    @SaCheckPermission("office:project:edit")
    public R<Void> removeMember(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(projectService.removeMembers(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增项目里程碑")
    @PostMapping("/milestone")
    @SaCheckPermission("office:project:edit")
    public R<Void> addMilestone(@RequestBody OaProjectMilestone milestone) {
        try {
            return R.result(projectService.addMilestone(milestone));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改项目里程碑")
    @PutMapping("/milestone")
    @SaCheckPermission("office:project:edit")
    public R<Void> editMilestone(@RequestBody OaProjectMilestone milestone) {
        try {
            return R.result(projectService.updateMilestone(milestone));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除项目里程碑")
    @DeleteMapping("/milestone/{ids}")
    @SaCheckPermission("office:project:edit")
    public R<Void> removeMilestone(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(projectService.removeMilestones(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增项目风险")
    @PostMapping("/risk")
    @SaCheckPermission("office:project:edit")
    public R<Void> addRisk(@RequestBody OaProjectRisk risk) {
        try {
            return R.result(projectService.addRisk(risk));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改项目风险")
    @PutMapping("/risk")
    @SaCheckPermission("office:project:edit")
    public R<Void> editRisk(@RequestBody OaProjectRisk risk) {
        try {
            return R.result(projectService.updateRisk(risk));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除项目风险")
    @DeleteMapping("/risk/{ids}")
    @SaCheckPermission("office:project:edit")
    public R<Void> removeRisk(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(projectService.removeRisks(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增WBS任务")
    @PostMapping("/wbs")
    @SaCheckPermission("office:project:wbs")
    public R<Void> addWbs(@RequestBody WorkTask task) {
        try {
            return R.result(projectService.addWbsTask(task));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改WBS任务")
    @PutMapping("/wbs")
    @SaCheckPermission("office:project:wbs")
    public R<Void> editWbs(@RequestBody WorkTask task) {
        try {
            return R.result(projectService.updateWbsTask(task));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("批量调整WBS树")
    @PutMapping("/wbs/tree")
    @SaCheckPermission("office:project:wbs")
    public R<Void> updateWbsTree(@RequestParam("projectId") Long projectId,
                                 @RequestBody List<ProjectWbsTreeNodeDTO> nodes) {
        try {
            return R.result(projectService.updateWbsTree(projectId, nodes));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除WBS任务")
    @DeleteMapping("/wbs/{ids}")
    @SaCheckPermission("office:project:wbs")
    public R<Void> removeWbs(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(projectService.removeWbsTasks(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增项目依赖")
    @PostMapping("/dependency")
    @SaCheckPermission("office:project:wbs")
    public R<Void> addDependency(@RequestBody OaProjectDependency dependency) {
        try {
            return R.result(projectService.addDependency(dependency));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改项目依赖")
    @PutMapping("/dependency")
    @SaCheckPermission("office:project:wbs")
    public R<Void> editDependency(@RequestBody OaProjectDependency dependency) {
        try {
            return R.result(projectService.updateDependency(dependency));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除项目依赖")
    @DeleteMapping("/dependency/{ids}")
    @SaCheckPermission("office:project:wbs")
    public R<Void> removeDependency(@PathVariable("ids") List<Long> ids) {
        try {
            return R.result(projectService.removeDependencies(ids));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改项目")
    @PutMapping
    @SaCheckPermission("office:project:edit")
    public R<Void> edit(@RequestBody OaProject project) {
        try {
            return R.result(projectService.updateProject(project));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交项目立项")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("office:project:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(projectService.submitProject(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("归档项目")
    @PostMapping("/archive/{id}")
    @SaCheckPermission("office:project:archive")
    public R<Void> archive(@PathVariable("id") Long id) {
        try {
            return R.result(projectService.archiveProject(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("项目基线快照")
    @PostMapping("/{id}/baseline/snapshot")
    @SaCheckPermission("office:project:baseline")
    public R<Void> snapshotBaseline(@PathVariable("id") Long id) {
        try {
            return R.result(projectService.snapshotBaseline(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除项目")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("office:project:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            OaProject project = new OaProject();
            project.setProjectId(id);
            project.setDelFlag("1");
            projectService.updateById(project);
        }
        return R.ok();
    }
}

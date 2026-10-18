package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaProjectTemplate;
import com.cloudflow.oa.domain.dto.ProjectTemplateSaveDTO;
import com.cloudflow.oa.service.impl.OaProjectTemplateService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/project-templates")
@RequiredArgsConstructor
public class ProjectTemplateController {
    private final OaProjectTemplateService service;

    @GetMapping
    @SaCheckPermission("oa:project-template:list")
    public R<List<OaProjectTemplate>> list() { return R.ok(service.list()); }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:project-template:list")
    public R<ProjectTemplateSaveDTO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @PostMapping
    @SaCheckPermission("oa:project-template:edit")
    @RepeatSubmit
    @SysLog("保存项目模板")
    public R<Long> save(@RequestBody ProjectTemplateSaveDTO request) { return R.ok(service.save(request)); }

    @PostMapping("/{id}/apply/{projectId}")
    @SaCheckPermission("oa:project:edit")
    @RepeatSubmit
    @SysLog("应用项目任务模板")
    public R<Void> applyTemplate(@PathVariable Long id, @PathVariable Long projectId) { service.applyTemplate(id, projectId); return R.ok(); }

    @PostMapping("/from-project/{projectId}")
    @SaCheckPermission("oa:project-template:edit")
    @RepeatSubmit
    @SysLog("从项目保存任务模板")
    public R<Long> saveFromProject(@PathVariable Long projectId, @RequestBody OaProjectTemplate template) { return R.ok(service.saveFromProject(projectId, template)); }
}

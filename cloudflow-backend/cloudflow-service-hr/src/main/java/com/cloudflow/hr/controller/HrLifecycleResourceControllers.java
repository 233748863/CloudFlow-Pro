package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.HrLifecycleStatusChangePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleTaskPayload;
import com.cloudflow.hr.domain.dto.lifecycle.HrLifecycleCommonQueryDTO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleApplicationVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleDetailVO;
import com.cloudflow.hr.domain.vo.lifecycle.HrLifecycleTaskVO;
import com.cloudflow.hr.service.HrLifecycleService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/lifecycle")
@RequiredArgsConstructor
class HrLifecycleApplicationController {

    private final HrLifecycleService lifecycleService;

    @GetMapping("/applications")
    @SaCheckPermission("hr:lifecycle:list")
    public R<List<HrLifecycleApplicationVO>> listLifecycleApplications(@Validated @ModelAttribute HrLifecycleCommonQueryDTO query) {
        return R.ok(lifecycleService.listApplications(query));
    }

    @SysLog("新增HR生命周期申请")
    @RepeatSubmit
    @PostMapping("/applications")
    @SaCheckPermission("hr:lifecycle:add")
    public R<Long> createLifecycleApplication(@RequestBody HrLifecycleApplicationPayload payload) {
        return R.ok(lifecycleService.createApplication(payload));
    }

    @SysLog("修改HR生命周期申请")
    @PutMapping("/applications/{id}")
    @SaCheckPermission("hr:lifecycle:edit")
    public R<Void> updateLifecycleApplication(@PathVariable Long id, @RequestBody HrLifecycleApplicationPayload payload) {
        lifecycleService.updateApplication(id, payload);
        return R.ok();
    }

    @SysLog("变更HR生命周期申请状态")
    @PostMapping("/applications/{id}/{action}")
    @SaCheckPermission("hr:lifecycle:edit")
    public R<Void> changeLifecycleStatus(@PathVariable Long id,
                                         @PathVariable String action,
                                         @RequestBody(required = false) HrLifecycleStatusChangePayload payload) {
        lifecycleService.changeLifecycleStatus(id, action, payload);
        return R.ok();
    }

    @GetMapping("/applications/{id}/details")
    @SaCheckPermission("hr:lifecycle:view")
    public R<List<HrLifecycleDetailVO>> listLifecycleDetails(@PathVariable Long id) {
        return R.ok(lifecycleService.listDetails(id));
    }

    @GetMapping("/applications/{id}/tasks")
    @SaCheckPermission("hr:lifecycle:view")
    public R<List<HrLifecycleTaskVO>> listLifecycleTasks(@PathVariable Long id) {
        return R.ok(lifecycleService.listTasks(id));
    }
}

@RestController
@RequestMapping("/lifecycle")
@RequiredArgsConstructor
class HrLifecycleTaskController {

    private final HrLifecycleService lifecycleService;

    @SysLog("完成HR生命周期任务")
    @PostMapping("/tasks/{id}/complete")
    @SaCheckPermission("hr:lifecycle:edit")
    public R<Void> completeLifecycleTask(@PathVariable Long id, @RequestBody(required = false) HrLifecycleTaskPayload payload) {
        lifecycleService.completeTask(id, payload);
        return R.ok();
    }
}

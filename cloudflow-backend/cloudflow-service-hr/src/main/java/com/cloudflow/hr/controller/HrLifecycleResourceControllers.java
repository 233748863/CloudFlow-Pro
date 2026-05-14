package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrLifecycleApplicationPayload;
import com.cloudflow.hr.domain.dto.HrLifecycleStatusChangePayload;
import com.cloudflow.hr.domain.dto.HrLifecycleTaskPayload;
import com.cloudflow.hr.service.HrLifecycleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/lifecycle")
@RequiredArgsConstructor
@SaCheckLogin
class HrLifecycleApplicationController {

    private final HrLifecycleService lifecycleService;

    @GetMapping("/applications")
    public R<?> listLifecycleApplications(@RequestParam Map<String, Object> query) {
        return R.ok(lifecycleService.listApplications(query));
    }

    @SysLog("新增HR生命周期申请")
    @PostMapping("/applications")
    public R<Long> createLifecycleApplication(@RequestBody HrLifecycleApplicationPayload payload) {
        return R.ok(lifecycleService.createApplication(payload));
    }

    @SysLog("修改HR生命周期申请")
    @PutMapping("/applications/{id}")
    public R<Void> updateLifecycleApplication(@PathVariable Long id, @RequestBody HrLifecycleApplicationPayload payload) {
        lifecycleService.updateApplication(id, payload);
        return R.ok();
    }

    @SysLog("变更HR生命周期申请状态")
    @PostMapping("/applications/{id}/{action}")
    public R<Void> changeLifecycleStatus(@PathVariable Long id,
                                         @PathVariable String action,
                                         @RequestBody(required = false) HrLifecycleStatusChangePayload payload) {
        lifecycleService.changeLifecycleStatus(id, action, payload);
        return R.ok();
    }

    @GetMapping("/applications/{id}/details")
    public R<?> listLifecycleDetails(@PathVariable Long id) {
        return R.ok(lifecycleService.listDetails(id));
    }

    @GetMapping("/applications/{id}/tasks")
    public R<?> listLifecycleTasks(@PathVariable Long id) {
        return R.ok(lifecycleService.listTasks(id));
    }
}

@RestController
@RequestMapping("/lifecycle")
@RequiredArgsConstructor
@SaCheckLogin
class HrLifecycleTaskController {

    private final HrLifecycleService lifecycleService;

    @SysLog("完成HR生命周期任务")
    @PostMapping("/tasks/{id}/complete")
    public R<Void> completeLifecycleTask(@PathVariable Long id, @RequestBody(required = false) HrLifecycleTaskPayload payload) {
        lifecycleService.completeTask(id, payload);
        return R.ok();
    }
}

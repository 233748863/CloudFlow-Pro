package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.WorkTaskStatusDTO;
import com.cloudflow.oa.service.IWorkTaskService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 协作任务控制器
 */
@RestController
@RequestMapping("/work-task")
public class WorkTaskController {

    @Autowired
    private IWorkTaskService workTaskService;

    /**
     * 获取我的任务列表
     */
    @GetMapping("/list")
    public R<List<WorkTask>> list(@RequestParam(value = "status", required = false) String status) {
        Long userId = UserContext.getUserId();
        return R.ok(workTaskService.getMyTasks(userId, status));
    }

    /**
     * 获取任务详情
     */
    @GetMapping("/{taskId}")
    public R<WorkTask> getInfo(@PathVariable("taskId") Long taskId) {
        return R.ok(workTaskService.getById(taskId));
    }

    /**
     * 创建任务
     */
    @SysLog("创建协作任务")
    @PostMapping
    public R<Boolean> add(@RequestBody WorkTask workTask) {
        workTask.setOwnerId(UserContext.getUserId());
        workTask.setDeptId(UserContext.getDeptId()); // 设置部门ID用于数据权限
        workTask.setCreateBy(String.valueOf(UserContext.getUserId()));
        workTask.setCreateTime(LocalDateTime.now());
        // 默认负责人为自己
        if (workTask.getAssigneeId() == null) {
            workTask.setAssigneeId(UserContext.getUserId());
        }
        if (workTask.getStatus() == null) {
            workTask.setStatus("TODO");
        }
        return R.ok(workTaskService.save(workTask));
    }

    /**
     * 修改任务
     */
    @SysLog("修改协作任务")
    @PutMapping
    public R<Boolean> edit(@RequestBody WorkTask workTask) {
        workTask.setUpdateBy(String.valueOf(UserContext.getUserId()));
        workTask.setUpdateTime(LocalDateTime.now());
        return R.ok(workTaskService.updateById(workTask));
    }

    /**
     * 修改任务状态 (看板拖拽)
     */
    @SysLog("修改任务状态")
    @PutMapping("/status")
    public R<Boolean> updateStatus(@RequestBody WorkTaskStatusDTO dto) {
        return R.ok(workTaskService.updateStatus(dto.getTaskId(), dto.getStatus()));
    }

    /**
     * 删除任务
     */
    @SysLog("删除协作任务")
    @DeleteMapping("/{taskId}")
    public R<Boolean> remove(@PathVariable("taskId") Long taskId) {
        return R.ok(workTaskService.removeById(taskId));
    }
}

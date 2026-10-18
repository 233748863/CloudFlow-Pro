package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.im.ImTodoManagement;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/im/todo")
@RequiredArgsConstructor
public class ImTodoManagementController {
    private final ImTodoManagement todos;

    @GetMapping("/list")
    @SaCheckPermission("system:im:todo:reconcile")
    @RateLimiter(time = 60, count = 60)
    public R<ImTodoManagement.Overview> list(@RequestParam long configId, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(todos.list(configId, pageNum, pageSize)); }

    @PostMapping("/reconcile")
    @SaCheckPermission("system:im:todo:reconcile")
    @RepeatSubmit
    @RateLimiter(time = 60, count = 10)
    @SysLog(value = "管理员核对待办卡片状态", logParams = false)
    public R<ImTodoManagement.Result> reconcile(@RequestBody ImTodoManagement.Request request) { return R.ok(todos.reconcile(request)); }
}

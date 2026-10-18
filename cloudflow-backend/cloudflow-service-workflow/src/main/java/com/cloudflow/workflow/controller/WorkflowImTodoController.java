package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.workflow.service.WorkflowImTodoService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/im-todo")
@RequiredArgsConstructor
public class WorkflowImTodoController {
    private final WorkflowImTodoService todos;

    @PostMapping("/project")
    @Inner(allowedServices = "cloudflow-auth")
    @SysLog(value = "企业通信待办权限投影", logParams = false)
    public R<ImTaskTodos.Projection> project(@RequestBody ImTaskTodos.Request request) { return R.ok(todos.project(request)); }

    @PostMapping("/status")
    @Inner(allowedServices = "cloudflow-auth")
    @SysLog(value = "企业通信待办状态核对", logParams = false)
    public R<ImTaskTodos.Status> status(@RequestBody ImTaskTodos.Request request) { return R.ok(todos.status(request)); }
}

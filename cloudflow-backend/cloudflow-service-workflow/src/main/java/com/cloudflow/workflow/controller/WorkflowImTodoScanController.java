package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.workflow.service.WorkflowImTodoScanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/workflow/im-todo")
@RequiredArgsConstructor
public class WorkflowImTodoScanController {
    private final WorkflowImTodoScanService todos;

    @PostMapping("/scan")
    @Inner(allowedServices = "cloudflow-auth")
    @SysLog(value = "企业通信待办扫描", logParams = false)
    public R<ImTaskTodos.Page> scan(@RequestBody ImTaskTodos.Scan request) { return R.ok(todos.scan(request)); }
}

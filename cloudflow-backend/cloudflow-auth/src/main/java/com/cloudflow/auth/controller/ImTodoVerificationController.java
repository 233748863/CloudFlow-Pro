package com.cloudflow.auth.controller;

import com.cloudflow.auth.im.ImTodoAccounts;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.im.ImTaskTodos;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/im-todo")
@RequiredArgsConstructor
public class ImTodoVerificationController {
    private final ImTodoAccounts accounts;

    @PostMapping("/verify")
    @Inner(allowedServices = "cloudflow-service-workflow")
    @SysLog(value = "企业通信待办接收人核验", logParams = false)
    public R<ImTaskTodos.Actor> verify(@RequestBody ImTaskTodos.Request request) { return R.ok(accounts.verify(request)); }
}

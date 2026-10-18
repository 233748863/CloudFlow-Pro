package com.cloudflow.auth.controller;

import com.cloudflow.auth.im.ImCallbackAccounts;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/im-callback")
@RequiredArgsConstructor
public class ImCallbackVerificationController {
    private final ImCallbackAccounts accounts;

    @PostMapping("/verify")
    @Inner(allowedServices = "cloudflow-service-workflow")
    @SysLog(value = "企业通信审批身份核验", logParams = false)
    public R<ImTaskCallbacks.Actor> verify(@RequestBody ImTaskCallbacks.Request request) {
        return R.ok(accounts.verify(request));
    }
}

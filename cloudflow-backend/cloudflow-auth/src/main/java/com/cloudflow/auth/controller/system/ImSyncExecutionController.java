package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.im.ImSyncApplyRequest;
import com.cloudflow.auth.im.ImSyncRunner;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/im/sync")
@RequiredArgsConstructor
public class ImSyncExecutionController {
    private final ImSyncRunner runner;

    @ModelAttribute
    public void responseHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @PostMapping("/{runId}/apply")
    @SaCheckPermission("system:im:sync:run")
    @RepeatSubmit
    @RateLimiter(key = "auth:im:sync:apply", time = 60, count = 5, limitType = LimitType.USER)
    @SysLog(value = "确认执行企业微信组织同步", logParams = false)
    public R<ImSyncRunner.Result> apply(@PathVariable long runId, @RequestBody @Valid ImSyncApplyRequest request) {
        return R.ok(runner.apply(runId, request));
    }
}

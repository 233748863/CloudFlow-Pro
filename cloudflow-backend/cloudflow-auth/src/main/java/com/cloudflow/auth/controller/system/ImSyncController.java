package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.im.ImSyncService;
import com.cloudflow.auth.im.ImSyncViews;
import com.cloudflow.auth.im.ImVersionRequest;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/im")
@RequiredArgsConstructor
public class ImSyncController {
    private final ImSyncService service;

    @ModelAttribute
    public void responseHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @PostMapping("/config/{configId}/sync-preview")
    @SaCheckPermission("system:im:sync:preview")
    @RepeatSubmit
    @RateLimiter(key = "auth:im:sync:preview", time = 60, count = 5, limitType = LimitType.USER)
    @SysLog(value = "预览企业微信组织同步", logParams = false)
    public R<ImSyncViews.Report> preview(@PathVariable Long configId, @RequestBody @Valid ImVersionRequest request) {
        return R.ok(service.preview(configId, request));
    }

    @GetMapping("/sync/list")
    @SaCheckPermission("system:im:sync:list")
    @SysLog(value = "读取企业微信同步记录", logParams = false)
    public R<PageResult<ImSyncViews.Header>> list(@RequestParam Long configId, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(service.list(configId, pageNum, pageSize)); }

    @GetMapping("/sync/configurations")
    @SaCheckPermission("system:im:sync:list")
    @SysLog(value = "读取组织同步配置摘要", logParams = false)
    public R<ImSyncViews.Overview> configurations() { return R.ok(service.configurations()); }

    @GetMapping("/sync/{syncRunId}")
    @SaCheckPermission("system:im:sync:list")
    @SysLog(value = "读取企业微信同步预览", logParams = false)
    public R<ImSyncViews.Report> report(@PathVariable Long syncRunId, @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "50") int pageSize) { return R.ok(service.report(syncRunId, pageNum, pageSize)); }
}

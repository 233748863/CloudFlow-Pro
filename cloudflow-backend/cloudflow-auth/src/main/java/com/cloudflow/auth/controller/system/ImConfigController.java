package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.im.ImConfigRequest;
import com.cloudflow.auth.im.ImConfigService;
import com.cloudflow.auth.im.ImScopeService;
import com.cloudflow.auth.im.ImVersionRequest;
import com.cloudflow.auth.im.ImViews;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.domain.PageResult;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/system/im/config")
@RequiredArgsConstructor
public class ImConfigController {
    private final ImConfigService service;
    private final ImScopeService scopes;

    @ModelAttribute
    public void responseHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @GetMapping("/list")
    @SaCheckPermission("system:im:config:list")
    @SysLog(value = "读取企业通信配置", logParams = false)
    public R<ImViews.Overview> list(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(service.list(pageNum, pageSize)); }

    @GetMapping("/local-departments")
    @SaCheckPermission("system:im:config:manage")
    @SysLog(value = "读取同步范围本地部门候选", logParams = false)
    public R<PageResult<ImViews.DepartmentOption>> localDepartments(@RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "50") int pageSize) {
        return R.ok(scopes.localDepartments(keyword, pageNum, pageSize));
    }

    @PostMapping("/{configId}/remote-departments")
    @SaCheckPermission("system:im:config:manage")
    @RateLimiter(key = "auth:im:scope:remote", time = 60, count = 5, limitType = LimitType.USER)
    @SysLog(value = "读取企业微信授权部门候选", logParams = false)
    public R<ImViews.RemoteDepartments> remoteDepartments(@PathVariable Long configId, @RequestBody @Valid ImVersionRequest request) {
        return R.ok(scopes.remoteDepartments(configId, request));
    }

    @PostMapping
    @SaCheckPermission("system:im:config:manage")
    @RepeatSubmit
    @RateLimiter(key = "auth:im:config:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "新增企业通信配置", logParams = false)
    public R<ImViews.Config> create(@RequestBody @Valid ImConfigRequest request) { return R.ok(service.create(request)); }

    @PutMapping
    @SaCheckPermission("system:im:config:manage")
    @RepeatSubmit
    @RateLimiter(key = "auth:im:config:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "修改企业通信配置", logParams = false)
    public R<ImViews.Config> update(@RequestBody @Valid ImConfigRequest request) { return R.ok(service.update(request)); }

    @PostMapping("/{configId}/test")
    @SaCheckPermission("system:im:config:test")
    @RepeatSubmit
    @RateLimiter(key = "auth:im:config:test", time = 60, count = 5, limitType = LimitType.USER)
    @SysLog(value = "测试企业通信连接", logParams = false)
    public R<ImViews.TestResult> testConnection(@PathVariable Long configId,
            @RequestBody @Valid ImVersionRequest request) { return R.ok(service.testConnection(configId, request)); }
}

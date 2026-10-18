package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.datasource.DataSourceActivationRequest;
import com.cloudflow.auth.datasource.DataSourceManagementService;
import com.cloudflow.auth.datasource.DataSourceSaveRequest;
import com.cloudflow.auth.datasource.DataSourceVersionRequest;
import com.cloudflow.auth.datasource.DataSourceViews;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletResponse;
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
@RequestMapping("/system/data-source")
@RequiredArgsConstructor
public class DataSourceController {
    private final DataSourceManagementService service;

    @ModelAttribute
    public void responseHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
    }

    @GetMapping("/list")
    @SaCheckPermission("system:data-source:list")
    @SysLog(value = "读取平台数据源配置", logParams = false)
    public R<DataSourceViews.Overview> list(@RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "10") int pageSize) { return R.ok(service.list(pageNum, pageSize)); }

    @GetMapping("/{configId}")
    @SaCheckPermission("system:data-source:list")
    @SysLog(value = "读取平台数据源详情", logParams = false)
    public R<DataSourceViews.Config> detail(@PathVariable Long configId) { return R.ok(service.detail(configId)); }

    @PostMapping
    @SaCheckPermission("system:data-source:manage")
    @RepeatSubmit
    @RateLimiter(key = "auth:data-source:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "新增平台数据源配置", logParams = false)
    public R<DataSourceViews.Config> create(@RequestBody @Valid DataSourceSaveRequest request) { return R.ok(service.create(request)); }

    @PutMapping
    @SaCheckPermission("system:data-source:manage")
    @RepeatSubmit
    @RateLimiter(key = "auth:data-source:manage", time = 60, count = 20, limitType = LimitType.USER)
    @SysLog(value = "修改平台数据源配置", logParams = false)
    public R<DataSourceViews.Config> update(@RequestBody @Valid DataSourceSaveRequest request) { return R.ok(service.update(request)); }

    @PostMapping("/{configId}/test")
    @SaCheckPermission("system:data-source:test")
    @RepeatSubmit
    @RateLimiter(key = "auth:data-source:test", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "测试平台数据源连接", logParams = false)
    public R<DataSourceViews.TestResult> testConnection(@PathVariable Long configId,
            @RequestBody @Valid DataSourceVersionRequest request) { return R.ok(service.testConnection(configId, request)); }

    @PostMapping("/{configId}/register")
    @SaCheckPermission("system:data-source:register")
    @RepeatSubmit
    @RateLimiter(key = "auth:data-source:register", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "注册平台数据源版本", logParams = false)
    public R<DataSourceViews.Config> register(@PathVariable Long configId,
            @RequestBody @Valid DataSourceActivationRequest request) { return R.ok(service.register(configId, request)); }

    @PostMapping("/{configId}/disable")
    @SaCheckPermission("system:data-source:register")
    @RepeatSubmit
    @RateLimiter(key = "auth:data-source:register", time = 60, count = 10, limitType = LimitType.USER)
    @SysLog(value = "停用平台数据源版本", logParams = false)
    public R<DataSourceViews.Config> disable(@PathVariable Long configId,
            @RequestBody @Valid DataSourceActivationRequest request) { return R.ok(service.disable(configId, request)); }
}

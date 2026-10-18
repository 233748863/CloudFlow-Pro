package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.vo.ObservabilityModels;
import com.cloudflow.auth.service.ObservabilityService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/system/log")
@RequiredArgsConstructor
public class ObservabilityController {
    private final ObservabilityService service;

    @GetMapping("/error/list")
    @SaCheckPermission("system:log:error:list")
    public R<PageResult<SysApiErrorLog>> errors(@RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String serviceName, @RequestParam(required = false) String exceptionClass,
            @RequestParam(required = false) String status, @RequestParam(required = false) String traceId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return R.ok(service.errors(pageNum, pageSize, serviceName, exceptionClass, status, traceId, start, end));
    }

    @GetMapping("/error/{errorId}")
    @SaCheckPermission("system:log:error:list")
    public R<SysApiErrorLog> detail(@PathVariable Long errorId) { return R.ok(service.detail(errorId)); }

    @PostMapping("/error/{errorId}/process")
    @RepeatSubmit
    @SysLog(value = "处理API错误日志", logParams = false)
    @SaCheckPermission("system:log:error:process")
    public R<Void> process(@PathVariable Long errorId, @RequestBody @Valid ProcessRequest request) {
        service.process(errorId, request.expectedStatus(), request.status(), request.remark());
        return R.ok();
    }

    @GetMapping("/trace/{traceId}")
    @SaCheckPermission(value = {"system:log:list", "system:log:error:list"})
    public R<ObservabilityModels.TraceBundle> trace(@PathVariable String traceId,
            @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "100") int pageSize) {
        return R.ok(service.trace(traceId, pageNum, pageSize));
    }

    @GetMapping("/slow/top")
    @SaCheckPermission("system:log:list")
    public R<List<ObservabilityModels.SlowEndpoint>> slow(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(defaultValue = "duration") String sort) {
        return R.ok(service.slowTop(start, end, sort));
    }

    @GetMapping("/error/trend")
    @SaCheckPermission("system:log:error:list")
    public R<List<ObservabilityModels.ErrorTrend>> trend(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return R.ok(service.trend(start, end));
    }

    public record ProcessRequest(@NotBlank @Pattern(regexp = "TODO|PROCESSING|DONE|IGNORED") String expectedStatus,
                                 @NotBlank @Pattern(regexp = "TODO|PROCESSING|DONE|IGNORED") String status,
                                 @Size(max = 500) String remark) {
    }
}

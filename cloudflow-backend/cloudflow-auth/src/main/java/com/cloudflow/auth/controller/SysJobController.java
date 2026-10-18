package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.domain.dto.CronValidateDTO;
import com.cloudflow.auth.domain.dto.JobLogCleanDTO;
import com.cloudflow.auth.domain.dto.JobLogQuery;
import com.cloudflow.auth.domain.dto.JobToggleDTO;
import com.cloudflow.auth.domain.dto.JobTriggerDTO;
import com.cloudflow.auth.domain.dto.SysJobDTO;
import com.cloudflow.auth.domain.vo.CronValidateVO;
import com.cloudflow.auth.domain.vo.JobTriggerResultVO;
import com.cloudflow.auth.domain.vo.SysJobHandlerVO;
import com.cloudflow.auth.domain.vo.SysJobLogVO;
import com.cloudflow.auth.domain.vo.SysJobVO;
import com.cloudflow.auth.service.JobPlatformService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 集中定时任务管理。
 */
@RestController
@RequestMapping("/system/job")
@RequiredArgsConstructor
public class SysJobController {
    private final JobPlatformService service;

    @GetMapping("/list")
    @SaCheckPermission("system:job:list")
    public R<PageResult<SysJobVO>> list(SysJob query,
                                        @RequestParam(defaultValue = "1") Integer pageNum,
                                        @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.list(query, pageNum, pageSize));
    }

    @GetMapping("/{jobId}")
    @SaCheckPermission("system:job:list")
    public R<SysJobVO> getInfo(@PathVariable Long jobId) { return R.ok(service.get(jobId)); }

    @GetMapping("/handlers")
    @SaCheckPermission("system:job:list")
    public R<List<SysJobHandlerVO>> handlers(@RequestParam(required = false) String serviceName) {
        return R.ok(service.handlers(serviceName));
    }

    @SysLog("新增定时任务")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("system:job:add")
    public R<Void> add(@RequestBody @Valid SysJobDTO dto) { service.add(dto); return R.ok(); }

    @SysLog("修改定时任务")
    @PutMapping
    @SaCheckPermission("system:job:edit")
    public R<Void> edit(@RequestBody @Valid SysJobDTO dto) { service.edit(dto); return R.ok(); }

    @SysLog("删除定时任务")
    @DeleteMapping("/{jobIds}")
    @SaCheckPermission("system:job:remove")
    public R<Void> remove(@PathVariable List<Long> jobIds,
                          @RequestParam(defaultValue = "false") Boolean confirmCritical) {
        service.remove(jobIds, confirmCritical); return R.ok();
    }

    @SysLog("手动触发定时任务")
    @RepeatSubmit
    @PostMapping("/{jobId}/trigger")
    @SaCheckPermission("system:job:trigger")
    public R<JobTriggerResultVO> trigger(@PathVariable Long jobId,
                                         @RequestBody(required = false) JobTriggerDTO dto) {
        return R.ok(service.trigger(jobId, dto));
    }

    @SysLog("启停定时任务")
    @PutMapping("/{jobId}/toggle")
    @SaCheckPermission("system:job:toggle")
    public R<Void> toggle(@PathVariable Long jobId, @RequestBody @Valid JobToggleDTO dto) {
        service.toggle(jobId, dto); return R.ok();
    }

    @RepeatSubmit.Disabled
    @PostMapping("/cron/validate")
    @SaCheckPermission("system:job:list")
    public R<CronValidateVO> validateCron(@RequestBody CronValidateDTO dto) { return R.ok(service.validateCron(dto)); }

    @GetMapping("/log")
    @SaCheckPermission("system:job:log")
    public R<PageResult<SysJobLogVO>> logList(JobLogQuery query,
                                              @RequestParam(defaultValue = "1") Integer pageNum,
                                              @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.logs(query, pageNum, pageSize));
    }

    @GetMapping("/log/{logId}")
    @SaCheckPermission("system:job:log")
    public R<SysJobLogVO> logDetail(@PathVariable Long logId) { return R.ok(service.log(logId)); }

    @SysLog("清理定时任务日志")
    @DeleteMapping("/log/clean")
    @SaCheckPermission("system:job:remove")
    public R<Integer> cleanLog(@RequestBody JobLogCleanDTO dto) { return R.ok(service.cleanLogs(dto)); }
}

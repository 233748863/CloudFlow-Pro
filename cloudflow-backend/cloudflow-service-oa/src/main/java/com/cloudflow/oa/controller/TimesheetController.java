package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaTimesheet;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.domain.dto.TimesheetSaveDTO;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.service.impl.OaTimesheetService;
import com.cloudflow.oa.service.impl.OaProjectAccountingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/timesheets")
@RequiredArgsConstructor
public class TimesheetController {
    private final OaTimesheetService service;
    private final OaProjectAccountingService accounting;

    @GetMapping
    @SaCheckPermission("oa:timesheet:list")
    public R<PageResult<OaTimesheet>> list(@RequestParam(required = false) String status, @RequestParam(defaultValue = "false") boolean review, PageQuery page) { return R.ok(service.page(status, review, page)); }

    @GetMapping("/employee")
    @SaCheckPermission("oa:timesheet:list")
    public R<OaIdentityReference> employee() { return R.ok(service.employee()); }

    @GetMapping("/projects")
    @SaCheckPermission("oa:timesheet:list")
    public R<List<OaProject>> projects(@RequestParam(required = false) LocalDate from, @RequestParam(required = false) LocalDate to) {
        return R.ok(service.availableProjects(from, to));
    }

    @GetMapping("/projects/{id}/tasks")
    @SaCheckPermission("oa:timesheet:list")
    public R<List<OaProjectTask>> tasks(@PathVariable Long id, @RequestParam(required = false) LocalDate from,
                                      @RequestParam(required = false) LocalDate to) {
        return R.ok(service.availableTasks(id, from, to));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:timesheet:list")
    public R<TimesheetSaveDTO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @PostMapping
    @SaCheckPermission("oa:timesheet:edit")
    @RepeatSubmit
    @SysLog("保存本人工时")
    public R<Long> save(@RequestBody TimesheetSaveDTO request) { return R.ok(service.save(request)); }

    @PostMapping("/{id}/submit")
    @SaCheckPermission("oa:timesheet:submit")
    @RepeatSubmit
    @SysLog("提交工时审批")
    public R<Void> submit(@PathVariable Long id) { service.submit(id); return R.ok(); }

    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:timesheet:remove")
    @SysLog("删除草稿工时")
    public R<Void> remove(@PathVariable Long id) { service.remove(id); return R.ok(); }

    @PostMapping("/projects/{id}/recalculate")
    @SaCheckPermission("oa:project-cost:recalculate")
    @RepeatSubmit
    @SysLog("重算项目成本")
    public R<Void> recalculate(@PathVariable Long id) { accounting.recalculateRequested(id); return R.ok(); }

    @PostMapping("/projects/recalculate")
    @SaCheckPermission("oa:project-cost:recalculate")
    @RepeatSubmit
    @SysLog("全量重算项目工时与成本")
    public R<Integer> recalculateAll() { return R.ok(accounting.recalculateAll()); }
}

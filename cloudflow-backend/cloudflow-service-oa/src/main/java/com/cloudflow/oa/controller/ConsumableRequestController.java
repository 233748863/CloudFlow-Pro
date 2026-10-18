package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.service.impl.ConsumableReadService;
import com.cloudflow.oa.service.impl.ConsumableRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/consumable/request")
@RequiredArgsConstructor
public class ConsumableRequestController {
    private final ConsumableRequestService requests;
    private final ConsumableReadService reads;

    @GetMapping("/catalog")
    @SaCheckPermission("oa:consumable-request:lookup")
    public R<PageResult<ConsumableResults.CatalogItem>> catalog(ConsumableQuery query) {
        return R.ok(reads.catalog(query));
    }

    @GetMapping("/categories")
    @SaCheckPermission(value = {"oa:consumable-request:lookup", "oa:consumable:list"}, mode = SaMode.OR)
    public R<List<ConsumableResults.Category>> categories() {
        return R.ok(reads.categories());
    }

    @GetMapping("/list")
    @SaCheckPermission("oa:consumable-request:list")
    public R<PageResult<OaConsumableRequest>> list(ConsumableQuery query) {
        return R.ok(requests.page(query, "SELF"));
    }

    @GetMapping("/department-list")
    @SaCheckPermission("oa:consumable-request:dept-list")
    public R<PageResult<OaConsumableRequest>> departmentList(ConsumableQuery query) {
        return R.ok(requests.page(query, "DEPARTMENT"));
    }

    @GetMapping("/dispatch-list")
    @SaCheckPermission("oa:consumable-request:dispatch")
    public R<PageResult<OaConsumableRequest>> dispatchList(ConsumableQuery query) {
        return R.ok(requests.page(query, "DISPATCH"));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:consumable-request:query")
    public R<ConsumableResults.RequestView> detail(@PathVariable Long id) {
        return R.ok(requests.detail(id, false));
    }

    @GetMapping("/{id}/dispatch-detail")
    @SaCheckPermission("oa:consumable-request:dispatch")
    public R<ConsumableResults.RequestView> dispatchDetail(@PathVariable Long id) {
        return R.ok(requests.detail(id, true));
    }

    @PostMapping
    @SaCheckPermission("oa:consumable-request:add")
    @RepeatSubmit.Disabled
    @SysLog("新建耗材领用申请")
    public R<ConsumableResults.RequestResult> create(@RequestBody ConsumableCommands.CreateRequest command) {
        return R.ok(requests.create(command));
    }

    @PutMapping("/{id}")
    @SaCheckPermission("oa:consumable-request:edit")
    @RepeatSubmit
    @SysLog("编辑耗材领用申请")
    public R<ConsumableResults.RequestResult> edit(@PathVariable Long id, @RequestBody ConsumableCommands.EditRequest command) {
        return R.ok(requests.edit(id, command));
    }

    @PostMapping("/{id}/submit")
    @SaCheckPermission("oa:consumable-request:submit")
    @RepeatSubmit.Disabled
    @SysLog("提交耗材领用审批")
    public R<ConsumableResults.RequestResult> submit(@PathVariable Long id, @RequestBody ConsumableCommands.Submit command) {
        return R.ok(requests.submit(id, command));
    }

    @PostMapping("/{id}/cancel")
    @SaCheckPermission("oa:consumable-request:cancel")
    @RepeatSubmit.Disabled
    @SysLog("取消耗材领用申请")
    public R<ConsumableResults.RequestResult> cancel(@PathVariable Long id, @RequestBody ConsumableCommands.Cancel command) {
        return R.ok(requests.cancel(id, command));
    }

    @PostMapping("/{id}/issue")
    @SaCheckPermission({"oa:consumable-request:dispatch", "oa:consumable-request:issue"})
    @RepeatSubmit.Disabled
    @SysLog("耗材领用分批发料")
    public R<ConsumableResults.IssueResult> issue(@PathVariable Long id, @RequestBody ConsumableCommands.Issue command) {
        return R.ok(requests.issue(id, command));
    }
}

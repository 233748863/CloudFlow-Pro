package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmActivity;
import com.cloudflow.crm.domain.dto.CrmActivityQuery;
import com.cloudflow.crm.domain.dto.CrmActivityRequest;
import com.cloudflow.crm.domain.vo.CrmActivityDetailVO;
import com.cloudflow.crm.domain.vo.CrmTimelineItemVO;
import com.cloudflow.crm.service.impl.CrmActivityService;
import com.cloudflow.crm.service.impl.CrmReferenceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/activity")
@RequiredArgsConstructor
public class CrmActivityController {
    private final CrmActivityService service;

    @GetMapping({"/list", "/calendar"})
    @SaCheckPermission("crm:activity:list")
    public R<PageResult<CrmActivity>> list(CrmActivityQuery query, PageQuery page) {
        return R.ok(service.page(query, page));
    }

    @GetMapping("/contracts")
    @SaCheckPermission("crm:activity:list")
    public R<PageResult<CrmReferenceService.ContractChoice>> contractChoices(@RequestParam Long customerId, PageQuery page) {
        return R.ok(service.contractChoices(customerId, page));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:activity:list")
    public R<CrmActivityDetailVO> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }

    @PostMapping
    @RepeatSubmit
    @SysLog("新增CRM活动")
    @SaCheckPermission("crm:activity:add")
    public R<CrmActivityDetailVO> create(@Valid @RequestBody CrmActivityRequest request) {
        request.getActivity().setActivityId(null);
        return R.ok(service.save(request));
    }

    @PutMapping
    @RepeatSubmit
    @SysLog("修改CRM活动")
    @SaCheckPermission("crm:activity:edit")
    public R<CrmActivityDetailVO> update(@Valid @RequestBody CrmActivityRequest request) {
        if (request.getActivity().getActivityId() == null) return R.fail("活动ID不能为空");
        return R.ok(service.save(request));
    }

    @PostMapping("/{id}/complete")
    @RepeatSubmit
    @SysLog("完成CRM活动")
    @SaCheckPermission("crm:activity:edit")
    public R<CrmActivityDetailVO> complete(@PathVariable Long id, @RequestBody Completion request) {
        return R.ok(service.changeStatus(id, "COMPLETED", request.version(), request.resultSummary(), request.nextAction(), request.generateFollowUp()));
    }

    @PostMapping("/{id}/cancel")
    @RepeatSubmit
    @SysLog("取消CRM活动")
    @SaCheckPermission("crm:activity:edit")
    public R<CrmActivityDetailVO> cancel(@PathVariable Long id, @RequestBody Completion request) {
        return R.ok(service.changeStatus(id, "CANCELLED", request.version(), null, null, false));
    }

    @PostMapping("/{id}/next")
    @RepeatSubmit
    @SysLog("创建后续CRM活动")
    @SaCheckPermission("crm:activity:add")
    public R<CrmActivityDetailVO> createNext(@PathVariable Long id, @Valid @RequestBody CrmActivityRequest request) {
        return R.ok(service.next(id, request));
    }

    @PostMapping("/{id}/respond")
    @RepeatSubmit
    @SysLog("回复CRM活动邀请")
    @SaCheckPermission("crm:activity:list")
    public R<Void> respond(@PathVariable Long id, @RequestBody Response request) {
        service.respond(id, request.acceptanceStatus()); return R.ok();
    }

    @DeleteMapping("/{id}")
    @SysLog("删除CRM活动")
    @SaCheckPermission("crm:activity:remove")
    public R<Void> delete(@PathVariable Long id) { service.delete(id); return R.ok(); }

    @GetMapping("/customer/{customerId}/timeline")
    @SaCheckPermission("crm:customer:list")
    public R<PageResult<CrmTimelineItemVO>> timeline(@PathVariable Long customerId,
            @RequestParam(required = false) String type, PageQuery page) {
        return R.ok(service.timeline(customerId, type, page));
    }

    public record Completion(Integer version, String resultSummary, String nextAction, boolean generateFollowUp) { }
    public record Response(String acceptanceStatus) { }
}

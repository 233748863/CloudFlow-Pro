package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.dto.CrmCampaignRequest;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.cloudflow.crm.service.impl.CrmCampaignService;
import com.cloudflow.crm.service.impl.CrmCampaignDeliveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/campaign")
@RequiredArgsConstructor
public class CrmCampaignController {
    private final CrmCampaignService service;
    private final CrmCampaignDeliveryService delivery;
    @GetMapping("/list")
    @SaCheckPermission("crm:campaign:list")
    public R<PageResult<CrmCampaign>> list(CrmCampaign query, PageQuery page) { return R.ok(service.page(query, page)); }
    @GetMapping("/{id}")
    @SaCheckPermission("crm:campaign:list")
    public R<Map<String, Object>> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @SysLog("保存营销活动")
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("crm:campaign:edit")
    public R<CrmCampaign> save(@RequestBody CrmCampaignRequest request) { return R.ok(service.save(request)); }
    @GetMapping("/{id}/audience")
    @SaCheckPermission("crm:campaign:list")
    public R<Map<String, Object>> audience(@PathVariable Long id) { return R.ok(service.recipients(id)); }
    @SysLog("重算营销收入归因")
    @PostMapping("/{id}/recalculate")
    @RepeatSubmit
    @SaCheckPermission("crm:campaign:recalculate")
    public R<CrmCampaign> recalculate(@PathVariable Long id) { return R.ok(service.recalculate(id)); }
    @SysLog(value = "请求营销邮件发送", logParams = false)
    @PostMapping("/{id}/send")
    @RepeatSubmit
    @SaCheckPermission("crm:campaign:send")
    public R<com.cloudflow.crm.domain.CrmMassEmail> send(@PathVariable Long id, @RequestParam Long massEmailId,
            @RequestBody CrmMassEmailCommand command) {
        service.assertWritable(service.accessible(id));
        if (delivery.list(id).stream().noneMatch(task -> massEmailId.equals(task.getMassEmailId()))) return R.fail("邮件任务与活动不一致");
        return R.ok(delivery.send(massEmailId, command));
    }
    @SysLog("删除营销活动")
    @DeleteMapping("/{id}")
    @SaCheckPermission("crm:campaign:remove")
    public R<Void> delete(@PathVariable Long id) { service.delete(id); return R.ok(); }
}

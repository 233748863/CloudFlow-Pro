package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmTargetList;
import com.cloudflow.crm.domain.CrmTargetListMember;
import com.cloudflow.crm.domain.dto.CrmAudienceCondition;
import com.cloudflow.crm.domain.dto.CrmTargetListRequest;
import com.cloudflow.crm.service.impl.CrmAudienceService;
import com.cloudflow.crm.service.impl.CrmTargetListService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/target-list")
public class CrmTargetListController {
    private final CrmTargetListService service;
    private final CrmAudienceService audience;
    @GetMapping("/list")
    @SaCheckPermission("crm:target-list:list")
    public R<List<CrmTargetList>> list() { return R.ok(service.list()); }
    @GetMapping("/{id}")
    @SaCheckPermission("crm:target-list:list")
    public R<Map<String, Object>> detail(@PathVariable Long id) { return R.ok(service.detail(id)); }
    @SysLog("保存营销目标名单")
    @PostMapping
    @RepeatSubmit
    @SaCheckPermission("crm:target-list:edit")
    public R<CrmTargetList> save(@RequestBody CrmTargetListRequest request) { return R.ok(service.save(request)); }
    @SysLog("预览营销名单条件")
    @PostMapping("/preview")
    @RepeatSubmit.Disabled
    @SaCheckPermission("crm:target-list:edit")
    public R<List<CrmTargetListMember>> preview(@RequestBody CrmAudienceCondition condition) { return R.ok(audience.query(condition, audience.candidates()).stream().map(CrmAudienceService::masked).toList()); }
    @SysLog("刷新营销名单")
    @PostMapping("/{id}/refresh")
    @RepeatSubmit
    @SaCheckPermission("crm:target-list:edit")
    public R<CrmTargetList> refresh(@PathVariable Long id) { return R.ok(service.refresh(id)); }
    @SysLog("删除营销名单")
    @DeleteMapping("/{id}")
    @SaCheckPermission("crm:target-list:remove")
    public R<Void> delete(@PathVariable Long id) { service.delete(id); return R.ok(); }
    @GetMapping("/{id}/export")
    @SaCheckPermission("crm:target-list:export")
    public ResponseEntity<byte[]> export(@PathVariable Long id) {
        return ResponseEntity.ok().header("Content-Type", "text/csv;charset=UTF-8")
                .header("Content-Disposition", "attachment; filename=crm-target-list-" + id + ".csv").body(service.export(id));
    }
}

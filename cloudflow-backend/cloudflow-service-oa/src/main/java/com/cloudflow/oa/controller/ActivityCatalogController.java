package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaActivityType;
import com.cloudflow.oa.domain.OaActivityCost;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.service.impl.OaActivityCatalogService;
import com.cloudflow.oa.service.impl.OaRecordSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/activity-catalog")
@RequiredArgsConstructor
public class ActivityCatalogController {
    private final OaActivityCatalogService service;
    private final OaIdentityReferenceMapper identities;

    @GetMapping("/types")
    @SaCheckPermission(value = {"oa:timesheet:list", "oa:activity-cost:list"}, mode = SaMode.OR)
    public R<List<OaActivityType>> types() { return R.ok(service.types()); }

    @PostMapping("/types")
    @SaCheckPermission("oa:activity-type:edit")
    @RepeatSubmit
    @SysLog("保存工时活动类型")
    public R<Long> saveType(@RequestBody OaActivityType type) { return R.ok(service.saveType(type)); }

    @GetMapping("/costs")
    @SaCheckPermission("oa:activity-cost:list")
    public R<List<OaActivityCost>> costs(@RequestParam(required = false) Long typeId) { return R.ok(service.costs(typeId)); }

    @PostMapping("/costs")
    @SaCheckPermission("oa:activity-cost:edit")
    @RepeatSubmit
    @SysLog("保存工时单价")
    public R<Long> saveCost(@RequestBody OaActivityCost cost) { return R.ok(service.saveCost(cost)); }

    @GetMapping("/employees")
    @SaCheckPermission("oa:activity-cost:list")
    public R<List<OaIdentityReference>> employees() { return R.ok(identities.employees(OaRecordSupport.tenantId())); }

    @GetMapping("/job-levels")
    @SaCheckPermission("oa:activity-cost:list")
    public R<List<OaIdentityReference>> jobLevels() { return R.ok(identities.jobLevels(OaRecordSupport.tenantId())); }
}

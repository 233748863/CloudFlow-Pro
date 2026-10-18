package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.domain.dto.CrmSalesStageRequest;
import com.cloudflow.crm.service.opportunity.CrmSalesStageService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/sales-stage")
@RequiredArgsConstructor
public class CrmSalesStageController {
    private final CrmSalesStageService service;

    @GetMapping("/list")
    @SaCheckPermission("crm:sales-stage:list")
    public R<List<CrmSalesStage>> list() { return R.ok(service.list()); }

    @PostMapping
    @SysLog("新增销售阶段规则")
    @RepeatSubmit
    @SaCheckPermission("crm:sales-stage:manage")
    public R<CrmSalesStage> add(@RequestBody CrmSalesStageRequest request) {
        if (request.stageId() != null) throw new IllegalArgumentException("新增阶段不能指定ID");
        return R.ok(service.save(request));
    }

    @PutMapping
    @SysLog("修改销售阶段规则")
    @RepeatSubmit
    @SaCheckPermission("crm:sales-stage:manage")
    public R<CrmSalesStage> update(@RequestBody CrmSalesStageRequest request) {
        if (request.stageId() == null) throw new IllegalArgumentException("修改阶段必须指定ID");
        return R.ok(service.save(request));
    }
}

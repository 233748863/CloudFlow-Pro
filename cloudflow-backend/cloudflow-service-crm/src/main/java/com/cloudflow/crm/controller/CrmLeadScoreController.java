package com.cloudflow.crm.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmLeadScoreRule;
import com.cloudflow.crm.service.impl.CrmLeadScoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/lead-score")
@RequiredArgsConstructor
public class CrmLeadScoreController {
    private final CrmLeadScoreService service;
    @GetMapping("/rules")
    @SaCheckPermission("crm:lead-score:list")
    public R<List<CrmLeadScoreRule>> rules() { return R.ok(service.rules()); }
    @SysLog("保存线索评分规则")
    @PostMapping("/rule")
    @RepeatSubmit
    @SaCheckPermission("crm:lead-score:edit")
    public R<CrmLeadScoreRule> save(@RequestBody CrmLeadScoreRule rule) { return R.ok(service.save(rule)); }
    @SysLog("重算线索评分")
    @PostMapping("/{leadId}/recalculate")
    @RepeatSubmit
    @SaCheckPermission("crm:lead:score")
    public R<Integer> recalculate(@PathVariable Long leadId) { return R.ok(service.recalculate(leadId)); }
    @SysLog("提交批量线索评分")
    @PostMapping("/batch")
    @RepeatSubmit
    @SaCheckPermission("crm:lead:score")
    public R<String> submit(@RequestBody List<Long> leadIds) { return R.ok(service.submitBatch(leadIds)); }
}

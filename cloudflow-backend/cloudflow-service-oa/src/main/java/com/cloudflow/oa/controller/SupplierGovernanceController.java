package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.*;
import com.cloudflow.oa.service.impl.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/supplier")
@RequiredArgsConstructor
public class SupplierGovernanceController {
    private final OaSupplierGovernanceService service;
    private final OaSupplierDecisionService decisions;

    @PostMapping("/{id}/decisions")
    @SaCheckPermission("oa:supplier:govern")
    @SysLog("提交供应商治理审批")
    @RepeatSubmit
    public R<Void> submitDecision(@PathVariable Long id, @Valid @RequestBody SupplierDecisionDTO request) { decisions.submitDecision(id, request); return R.ok(); }

    @GetMapping("/categories")
    @SaCheckPermission("oa:supplier:list")
    public R<List<OaSupplierCategory>> categories() { return R.ok(service.categories()); }

    @PostMapping("/categories")
    @SaCheckPermission("oa:supplier-category:edit")
    @SysLog("保存供应商分类")
    @RepeatSubmit
    public R<Long> saveCategory(@Valid @RequestBody OaSupplierCategory category) { return R.ok(service.saveCategory(category)); }

    @DeleteMapping("/categories/{id}")
    @SaCheckPermission("oa:supplier-category:remove")
    @SysLog("删除供应商分类")
    public R<Void> removeCategory(@PathVariable Long id) { service.removeCategory(id); return R.ok(); }

    @GetMapping("/{id}/qualifications")
    @SaCheckPermission("oa:supplier:list")
    public R<List<OaSupplierQualification>> qualifications(@PathVariable Long id) { return R.ok(service.qualifications(id)); }

    @PostMapping("/qualifications")
    @SaCheckPermission("oa:supplier-qualification:edit")
    @SysLog("保存供应商资质")
    @RepeatSubmit
    public R<Long> saveQualification(@Valid @RequestBody OaSupplierQualification qualification) { return R.ok(service.saveQualification(qualification)); }

    @PostMapping("/qualifications/{id}/verify")
    @SaCheckPermission("oa:supplier-qualification:verify")
    @SysLog("核验供应商资质")
    @RepeatSubmit
    public R<Void> verifyQualification(@PathVariable Long id, @Valid @RequestBody OaDecisionDTO decision) { service.verifyQualification(id, Boolean.TRUE.equals(decision.getAccepted()), decision.getReason()); return R.ok(); }

    @GetMapping("/scorecards")
    @SaCheckPermission("oa:supplier-score:list")
    public R<PageResult<OaSupplierScorecard>> scorecards(@RequestParam(required=false) Long supplierId, PageQuery page) { return R.ok(service.scorecards(supplierId,page)); }

    @GetMapping("/scorecards/{id}/criteria")
    @SaCheckPermission("oa:supplier-score:list")
    public R<List<OaSupplierScoreCriteria>> criteria(@PathVariable Long id) { return R.ok(service.criteria(id)); }

    @PostMapping("/scorecards")
    @SaCheckPermission("oa:supplier-score:edit")
    @SysLog("保存供应商评分")
    @RepeatSubmit
    public R<Long> saveScorecard(@Valid @RequestBody SupplierScorecardDTO request) { return R.ok(service.saveScorecard(request)); }

    @PostMapping("/scorecards/{id}/confirm")
    @SaCheckPermission("oa:supplier-score:confirm")
    @SysLog("确认供应商评分")
    @RepeatSubmit
    public R<Void> confirmScorecard(@PathVariable Long id) { service.confirmScorecard(id); return R.ok(); }
}

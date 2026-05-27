package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaBudgetAdjustment;
import com.cloudflow.oa.domain.OaBudgetLedger;
import com.cloudflow.oa.domain.OaBudgetPlan;
import com.cloudflow.oa.domain.OaBudgetSubject;
import com.cloudflow.oa.domain.vo.BudgetExecutionSummaryVO;
import com.cloudflow.oa.service.IOaBudgetService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/budget")
@RequiredArgsConstructor
public class BudgetController {

    private final IOaBudgetService oaBudgetService;

    @GetMapping("/plan/list")
    @SaCheckPermission("oa:budget:list")
    public R<PageResult<OaBudgetPlan>> planList(OaBudgetPlan query, PageQuery pageQuery) {
        return R.ok(oaBudgetService.queryBudgetPage(query, pageQuery));
    }

    @GetMapping("/plan/{id}")
    @SaCheckPermission("oa:budget:list")
    public R<OaBudgetPlan> planDetail(@PathVariable("id") Long id) {
        try {
            return R.ok(oaBudgetService.getBudgetDetail(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/subject/list")
    @SaCheckPermission("oa:budget:list")
    public R<PageResult<OaBudgetSubject>> subjectList(OaBudgetSubject query, PageQuery pageQuery) {
        return R.ok(oaBudgetService.querySubjectPage(query, pageQuery));
    }

    @GetMapping("/adjustment/list")
    @SaCheckPermission("oa:budget:list")
    public R<PageResult<OaBudgetAdjustment>> adjustmentList(OaBudgetAdjustment query, PageQuery pageQuery) {
        return R.ok(oaBudgetService.queryAdjustmentPage(query, pageQuery));
    }

    @SysLog("新增预算")
    @PostMapping("/plan")
    @SaCheckPermission("oa:budget:add")
    public R<Void> addPlan(@RequestBody OaBudgetPlan plan) {
        try {
            return R.result(oaBudgetService.createBudget(plan));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改预算")
    @PutMapping("/plan")
    @SaCheckPermission("oa:budget:edit")
    public R<Void> editPlan(@RequestBody OaBudgetPlan plan) {
        try {
            return R.result(oaBudgetService.updateBudget(plan));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交预算")
    @PostMapping("/plan/submit/{id}")
    @SaCheckPermission("oa:budget:submit")
    public R<Void> submitPlan(@PathVariable("id") Long id) {
        try {
            return R.result(oaBudgetService.submitBudget(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增预算科目")
    @PostMapping("/subject")
    @SaCheckPermission("oa:budget:subject")
    public R<Void> addSubject(@RequestBody OaBudgetSubject subject) {
        try {
            return R.result(oaBudgetService.createSubject(subject));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改预算科目")
    @PutMapping("/subject")
    @SaCheckPermission("oa:budget:subject")
    public R<Void> editSubject(@RequestBody OaBudgetSubject subject) {
        try {
            return R.result(oaBudgetService.updateSubject(subject));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增预算调整")
    @PostMapping("/adjustment")
    @SaCheckPermission("oa:budget:adjustment")
    public R<Void> addAdjustment(@RequestBody OaBudgetAdjustment adjustment) {
        try {
            return R.result(oaBudgetService.createAdjustment(adjustment));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交预算调整")
    @PostMapping("/adjustment/submit/{id}")
    @SaCheckPermission("oa:budget:adjustment")
    public R<Void> submitAdjustment(@PathVariable("id") Long id) {
        try {
            return R.result(oaBudgetService.submitAdjustment(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/execution/ledger")
    @SaCheckPermission("oa:budget:list")
    public R<PageResult<OaBudgetLedger>> ledger(OaBudgetLedger query, PageQuery pageQuery) {
        return R.ok(oaBudgetService.queryLedgerPage(query, pageQuery));
    }

    @GetMapping("/execution/summary")
    @SaCheckPermission("oa:budget:list")
    public R<BudgetExecutionSummaryVO> summary(@RequestParam("budgetId") Long budgetId,
                                               @RequestParam(value = "subjectCode", required = false) String subjectCode) {
        try {
            return R.ok(oaBudgetService.getExecutionSummary(budgetId, subjectCode));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }
}


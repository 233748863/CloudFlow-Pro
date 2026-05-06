package com.cloudflow.auth.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.common.core.domain.R;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;

/**
 * 业务规则管理控制器。
 */
@RestController
@RequestMapping("/system/rules")
@RequiredArgsConstructor
public class BusinessRuleController {

    private final IBusinessRuleService businessRuleService;

    @GetMapping("/list")
    public R<Page<BusinessRule>> list(@RequestParam(required = false) String module,
                                      @RequestParam(required = false) String ruleCode,
                                      @RequestParam(required = false) Integer enabled,
                                      @RequestParam(defaultValue = "1") Integer pageNum,
                                      @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(businessRuleService.queryPage(module, ruleCode, enabled, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    public R<BusinessRule> getInfo(@PathVariable Long id) {
        return R.ok(businessRuleService.getById(id));
    }

    @GetMapping("/effective/{ruleCode}")
    public R<BusinessRule> getEffectiveRule(@PathVariable String ruleCode) {
        return R.ok(businessRuleService.getEffectiveRule(ruleCode));
    }

    @PostMapping
    public R<Void> add(@RequestBody BusinessRule rule) {
        try {
            return R.result(businessRuleService.createRule(rule));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PutMapping
    public R<Void> edit(@RequestBody BusinessRule rule) {
        try {
            return R.result(businessRuleService.updateRule(rule));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PutMapping("/{id}/enabled")
    public R<Void> setEnabled(@PathVariable Long id, @RequestParam Integer enabled) {
        try {
            return R.result(businessRuleService.setEnabled(id, enabled));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable Long[] ids) {
        return R.result(businessRuleService.removeByIds(Arrays.asList(ids)));
    }
}

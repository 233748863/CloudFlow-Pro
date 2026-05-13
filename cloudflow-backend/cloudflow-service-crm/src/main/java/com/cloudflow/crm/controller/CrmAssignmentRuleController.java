package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmAssignmentRule;
import com.cloudflow.crm.service.ICrmAssignmentRuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/assignment-rule")
@RequiredArgsConstructor
public class CrmAssignmentRuleController {

    private final ICrmAssignmentRuleService assignmentRuleService;

    @GetMapping("/list")
    public R<PageResult<CrmAssignmentRule>> list(CrmAssignmentRule query, PageQuery pageQuery) {
        return R.ok(assignmentRuleService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmAssignmentRule> getInfo(@PathVariable("id") Long id) {
        CrmAssignmentRule rule = assignmentRuleService.getById(id);
        return rule == null || !"0".equals(rule.getDelFlag()) ? R.fail("分配规则不存在") : R.ok(rule);
    }

    @SysLog("新增客户分配规则")
    @PostMapping
    public R<Void> add(@RequestBody CrmAssignmentRule rule) {
        try {
            return R.result(assignmentRuleService.createRule(rule));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改客户分配规则")
    @PutMapping
    public R<Void> edit(@RequestBody CrmAssignmentRule rule) {
        try {
            return R.result(assignmentRuleService.updateRule(rule));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除客户分配规则")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmAssignmentRule rule = new CrmAssignmentRule();
            rule.setRuleId(id);
            rule.setDelFlag("1");
            assignmentRuleService.updateById(rule);
        }
        return R.ok();
    }
}

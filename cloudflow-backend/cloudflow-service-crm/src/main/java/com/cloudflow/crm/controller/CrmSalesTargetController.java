package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.service.ICrmSalesTargetService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/sales-target")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmSalesTargetController {

    private final ICrmSalesTargetService salesTargetService;

    @GetMapping("/list")
    @SaCheckPermission("crm:sales-target:list")
    public R<PageResult<CrmSalesTarget>> list(CrmSalesTarget query, PageQuery pageQuery) {
        return R.ok(salesTargetService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:sales-target:list")
    public R<CrmSalesTarget> getInfo(@PathVariable("id") Long id) {
        CrmSalesTarget salesTarget = salesTargetService.getById(id);
        return salesTarget == null || !"0".equals(salesTarget.getDelFlag()) ? R.fail("销售目标不存在") : R.ok(salesTarget);
    }

    @SysLog("新增CRM销售目标")
    @PostMapping
    @SaCheckPermission("crm:sales-target:add")
    public R<Void> add(@RequestBody CrmSalesTarget salesTarget) {
        try {
            return R.result(salesTargetService.createSalesTarget(salesTarget));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM销售目标")
    @PutMapping
    @SaCheckPermission("crm:sales-target:edit")
    public R<Void> edit(@RequestBody CrmSalesTarget salesTarget) {
        try {
            return R.result(salesTargetService.updateSalesTarget(salesTarget));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM销售目标")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:sales-target:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmSalesTarget salesTarget = new CrmSalesTarget();
            salesTarget.setSalesTargetId(id);
            salesTarget.setDelFlag("1");
            salesTargetService.updateById(salesTarget);
        }
        return R.ok();
    }
}

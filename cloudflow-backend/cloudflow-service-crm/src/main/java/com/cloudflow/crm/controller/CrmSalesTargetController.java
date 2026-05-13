package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.service.ICrmSalesTargetService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/sales-target")
@RequiredArgsConstructor
public class CrmSalesTargetController {

    private final ICrmSalesTargetService salesTargetService;

    @GetMapping("/list")
    public R<PageResult<CrmSalesTarget>> list(CrmSalesTarget query, PageQuery pageQuery) {
        return R.ok(salesTargetService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmSalesTarget> getInfo(@PathVariable("id") Long id) {
        CrmSalesTarget salesTarget = salesTargetService.getById(id);
        return salesTarget == null || !"0".equals(salesTarget.getDelFlag()) ? R.fail("销售目标不存在") : R.ok(salesTarget);
    }

    @SysLog("新增CRM销售目标")
    @PostMapping
    public R<Void> add(@RequestBody CrmSalesTarget salesTarget) {
        try {
            return R.result(salesTargetService.createSalesTarget(salesTarget));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM销售目标")
    @PutMapping
    public R<Void> edit(@RequestBody CrmSalesTarget salesTarget) {
        try {
            return R.result(salesTargetService.updateSalesTarget(salesTarget));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM销售目标")
    @DeleteMapping("/{ids}")
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

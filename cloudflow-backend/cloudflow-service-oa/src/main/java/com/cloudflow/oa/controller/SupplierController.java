package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.service.ISupplierService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 供应商管理 Controller。
 */
@RestController
@RequestMapping("/supplier")
@RequiredArgsConstructor
public class SupplierController {

    private final ISupplierService supplierService;

    @GetMapping("/list")
    public R<IPage<SysSupplier>> list(SysSupplier query,
                                      @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
                                      @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize) {
        return R.ok(supplierService.queryPage(query, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    public R<SysSupplier> getInfo(@PathVariable Long id) {
        SysSupplier supplier = supplierService.getById(id);
        if (supplier == null || !"0".equals(supplier.getDelFlag())) {
            return R.fail("供应商不存在");
        }
        return R.ok(supplier);
    }

    @SysLog("新增供应商")
    @PostMapping
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> add(@RequestBody SysSupplier supplier) {
        try {
            return supplierService.createSupplier(supplier) ? R.ok() : R.fail("创建失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改供应商")
    @PutMapping
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> edit(@RequestBody SysSupplier supplier) {
        try {
            return supplierService.updateSupplier(supplier) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除供应商")
    @DeleteMapping("/{ids}")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> remove(@PathVariable List<Long> ids) {
        for (Long id : ids) {
            SysSupplier supplier = new SysSupplier();
            supplier.setSupplierId(id);
            supplier.setDelFlag("1");
            supplierService.updateById(supplier);
        }
        return R.ok();
    }
}

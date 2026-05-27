package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.service.IOaExpenseStandardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * OA-P0-3 费用标准 REST 接口。
 */
@RestController
@RequestMapping("/expense/standard")
@RequiredArgsConstructor
public class OaExpenseStandardController {

    private final IOaExpenseStandardService oaExpenseStandardService;

    @GetMapping("/page")
    @SaCheckPermission("oa:expense:standard:list")
    public R<Page<OaExpenseStandard>> page(@RequestParam(required = false) String keyword,
                                           @RequestParam(required = false) String positionLevel,
                                           @RequestParam(required = false) String category,
                                           @RequestParam(required = false) String city,
                                           @RequestParam(required = false) String status,
                                           @RequestParam(defaultValue = "1") Integer pageNum,
                                           @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(oaExpenseStandardService.page(keyword, positionLevel, category, city, status, pageNum, pageSize));
    }

    @GetMapping("/active")
    @SaCheckPermission("oa:expense:claim:list")
    public R<List<OaExpenseStandard>> listActive() {
        return R.ok(oaExpenseStandardService.listActive());
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:expense:standard:list")
    public R<OaExpenseStandard> getInfo(@PathVariable("id") Long standardId) {
        return R.ok(oaExpenseStandardService.getById(standardId));
    }

    @SysLog("新增费用标准")
    @PostMapping
    @SaCheckPermission("oa:expense:standard:add")
    public R<Void> add(@RequestBody OaExpenseStandard standard) {
        try {
            return oaExpenseStandardService.save(standard) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改费用标准")
    @PutMapping
    @SaCheckPermission("oa:expense:standard:edit")
    public R<Void> edit(@RequestBody OaExpenseStandard standard) {
        try {
            return oaExpenseStandardService.update(standard) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除费用标准")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:expense:standard:remove")
    public R<Void> remove(@PathVariable("id") Long standardId) {
        return oaExpenseStandardService.remove(standardId) ? R.ok() : R.fail("删除失败");
    }
}

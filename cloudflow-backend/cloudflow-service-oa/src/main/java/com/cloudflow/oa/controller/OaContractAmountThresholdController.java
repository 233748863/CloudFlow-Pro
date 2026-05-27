package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaContractAmountThreshold;
import com.cloudflow.oa.service.IOaContractAmountThresholdService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * OA-P0-3 合同金额阈值 REST 接口。
 */
@RestController
@RequestMapping("/contract/threshold")
@RequiredArgsConstructor
public class OaContractAmountThresholdController {

    private final IOaContractAmountThresholdService oaContractAmountThresholdService;

    @GetMapping("/page")
    @SaCheckPermission("oa:contract:threshold:list")
    public R<Page<OaContractAmountThreshold>> page(@RequestParam(required = false) String keyword,
                                                   @RequestParam(required = false) String businessUnit,
                                                   @RequestParam(required = false) String amountTier,
                                                   @RequestParam(required = false) String status,
                                                   @RequestParam(defaultValue = "1") Integer pageNum,
                                                   @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(oaContractAmountThresholdService.page(keyword, businessUnit, amountTier, status, pageNum, pageSize));
    }

    @GetMapping("/active")
    @SaCheckPermission("oa:contract:threshold:list")
    public R<List<OaContractAmountThreshold>> listActive() {
        return R.ok(oaContractAmountThresholdService.listActive());
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:contract:threshold:list")
    public R<OaContractAmountThreshold> getInfo(@PathVariable("id") Long id) {
        return R.ok(oaContractAmountThresholdService.getById(id));
    }

    @SysLog("新增合同金额阈值")
    @PostMapping
    @SaCheckPermission("oa:contract:threshold:add")
    public R<Void> add(@RequestBody OaContractAmountThreshold threshold) {
        try {
            return oaContractAmountThresholdService.save(threshold) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同金额阈值")
    @PutMapping
    @SaCheckPermission("oa:contract:threshold:edit")
    public R<Void> edit(@RequestBody OaContractAmountThreshold threshold) {
        try {
            return oaContractAmountThresholdService.update(threshold) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除合同金额阈值")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:contract:threshold:remove")
    public R<Void> remove(@PathVariable("id") Long id) {
        return oaContractAmountThresholdService.remove(id) ? R.ok() : R.fail("删除失败");
    }
}

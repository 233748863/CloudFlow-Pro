package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.dto.PurchaseFromSuggestionDTO;
import com.cloudflow.oa.domain.dto.PurchaseReceiptDTO;
import com.cloudflow.oa.service.IPurchaseRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

/**
 * 行政采购申请 Controller。
 */
@RestController
@RequestMapping("/purchase/request")
@RequiredArgsConstructor
public class PurchaseRequestController {

    private final IPurchaseRequestService purchaseRequestService;

    @GetMapping("/list")
    public R<Page<BizPurchaseRequest>> list(@RequestParam(defaultValue = "1") Integer pageNum,
                                            @RequestParam(defaultValue = "10") Integer pageSize,
                                            @RequestParam(required = false) String status,
                                            @RequestParam(required = false) Long supplierId,
                                            @RequestParam(required = false) Long userId) {
        return R.ok(purchaseRequestService.queryPage(pageNum, pageSize, status, supplierId, userId));
    }

    @GetMapping("/{id}")
    public R<BizPurchaseRequest> getInfo(@PathVariable Long id) {
        BizPurchaseRequest purchase = purchaseRequestService.getRequestWithItems(id);
        if (purchase == null || !"0".equals(purchase.getDelFlag())) {
            return R.fail("采购申请不存在");
        }
        return R.ok(purchase);
    }

    @SysLog("新增采购申请")
    @PostMapping
    public R<Void> add(@RequestBody BizPurchaseRequest purchase) {
        try {
            return purchaseRequestService.createPurchase(purchase) ? R.ok() : R.fail("创建失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("补货建议生成采购草稿")
    @PostMapping("/from-suggestion")
    public R<BizPurchaseRequest> fromSuggestion(@RequestBody PurchaseFromSuggestionDTO dto) {
        try {
            return R.ok(purchaseRequestService.createFromSuggestion(dto));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改采购申请")
    @PutMapping
    public R<Void> edit(@RequestBody BizPurchaseRequest purchase) {
        try {
            return purchaseRequestService.updatePurchase(purchase) ? R.ok() : R.fail("更新失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除采购申请")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable Long[] ids) {
        for (Long id : ids) {
            BizPurchaseRequest purchase = new BizPurchaseRequest();
            purchase.setId(id);
            purchase.setDelFlag("1");
            purchaseRequestService.updateById(purchase);
        }
        return R.ok();
    }

    @SysLog("提交采购申请")
    @PostMapping("/submit/{id}")
    public R<Void> submit(@PathVariable Long id) {
        try {
            return purchaseRequestService.submitPurchase(id) ? R.ok() : R.fail("提交失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("采购分批入库")
    @PostMapping("/{id}/receipt")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<Void> receipt(@PathVariable Long id, @RequestBody PurchaseReceiptDTO receipt) {
        try {
            return purchaseRequestService.receivePurchase(id, receipt) ? R.ok() : R.fail("入库失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("采购生成付款申请")
    @PostMapping("/{id}/create-payment")
    @SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
    public R<BizPaymentRequest> createPayment(@PathVariable Long id) {
        try {
            return R.ok(purchaseRequestService.createPaymentRequest(id));
        } catch (IllegalArgumentException | IllegalStateException e) {
            return R.fail(e.getMessage());
        }
    }
}

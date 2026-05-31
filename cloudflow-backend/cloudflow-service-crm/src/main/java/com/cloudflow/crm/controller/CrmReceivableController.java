package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;
import com.cloudflow.crm.service.ICrmReceivableService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/receivable")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmReceivableController {

    private final ICrmReceivableService crmReceivableService;
    private final com.cloudflow.crm.service.ICrmCustomerService customerService;

    @GetMapping("/list")
    @SaCheckPermission("crm:receivable:list")
    public R<PageResult<CrmReceivable>> list(CrmReceivable query, PageQuery pageQuery) {
        return R.ok(crmReceivableService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:receivable:list")
    public R<CrmReceivable> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(crmReceivableService.getAccessibleReceivable(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/aging")
    @SaCheckPermission("crm:receivable:list")
    public R<List<CrmReceivableAgingBucketVO>> aging() {
        return R.ok(crmReceivableService.getAgingBuckets());
    }

    @SysLog("新增CRM回款计划")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("crm:receivable:add")
    public R<Void> add(@RequestBody CrmReceivable receivable) {
        try {
            return R.result(crmReceivableService.createReceivable(receivable));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM回款计划")
    @PutMapping
    @SaCheckPermission("crm:receivable:edit")
    public R<Void> edit(@RequestBody CrmReceivable receivable) {
        try {
            return R.result(crmReceivableService.updateReceivable(receivable));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认CRM回款")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/confirm")
    @SaCheckPermission("crm:receivable:confirm")
    public R<Void> confirm(@PathVariable("id") Long id) {
        try {
            return R.result(crmReceivableService.confirmReceipt(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定CRM回款发票")
    @PostMapping("/{id}/bind-invoice/{invoiceId}")
    @SaCheckPermission("crm:receivable:bind-invoice")
    public R<Void> bindInvoice(@PathVariable("id") Long id, @PathVariable("invoiceId") Long invoiceId) {
        try {
            return R.result(crmReceivableService.bindInvoice(id, invoiceId));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM回款计划")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:receivable:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmReceivable persisted;
            try {
                persisted = crmReceivableService.getAccessibleReceivable(id);
            } catch (IllegalArgumentException e) {
                return R.fail(e.getMessage());
            }
            CrmReceivable receivable = new CrmReceivable();
            receivable.setReceivableId(id);
            receivable.setDeleted(1);
            crmReceivableService.updateById(receivable);
            customerService.refreshHealth(persisted.getCustomerId());
        }
        return R.ok();
    }
}

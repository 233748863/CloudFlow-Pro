package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmReceivableAgingBucketVO;
import com.cloudflow.crm.service.ICrmReceivableService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/receivable")
@RequiredArgsConstructor
public class CrmReceivableController {

    private final ICrmReceivableService receivableService;
    private final com.cloudflow.crm.service.ICrmCustomerService customerService;

    @GetMapping("/list")
    public R<PageResult<CrmReceivable>> list(CrmReceivable query, PageQuery pageQuery) {
        return R.ok(receivableService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmReceivable> getInfo(@PathVariable("id") Long id) {
        CrmReceivable receivable = receivableService.getById(id);
        return receivable == null || !"0".equals(receivable.getDelFlag()) ? R.fail("回款计划不存在") : R.ok(receivable);
    }

    @GetMapping("/aging")
    public R<List<CrmReceivableAgingBucketVO>> aging() {
        return R.ok(receivableService.getAgingBuckets());
    }

    @SysLog("新增CRM回款计划")
    @PostMapping
    public R<Void> add(@RequestBody CrmReceivable receivable) {
        try {
            return R.result(receivableService.createReceivable(receivable));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM回款计划")
    @PutMapping
    public R<Void> edit(@RequestBody CrmReceivable receivable) {
        try {
            return R.result(receivableService.updateReceivable(receivable));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("确认CRM回款")
    @PostMapping("/{id}/confirm")
    public R<Void> confirm(@PathVariable("id") Long id) {
        try {
            return R.result(receivableService.confirmReceipt(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定CRM回款发票")
    @PostMapping("/{id}/bind-invoice/{invoiceId}")
    public R<Void> bindInvoice(@PathVariable("id") Long id, @PathVariable("invoiceId") Long invoiceId) {
        try {
            return R.result(receivableService.bindInvoice(id, invoiceId));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM回款计划")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmReceivable persisted = receivableService.getById(id);
            CrmReceivable receivable = new CrmReceivable();
            receivable.setReceivableId(id);
            receivable.setDelFlag("1");
            receivableService.updateById(receivable);
            if (persisted != null) {
                customerService.refreshHealth(persisted.getCustomerId());
            }
        }
        return R.ok();
    }
}

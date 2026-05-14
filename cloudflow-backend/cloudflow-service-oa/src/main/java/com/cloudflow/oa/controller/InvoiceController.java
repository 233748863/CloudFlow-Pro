package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaInvoiceWriteoff;
import com.cloudflow.oa.service.IOaInvoiceService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/invoice")
@SaCheckLogin
@RequiredArgsConstructor
public class InvoiceController {

    private final IOaInvoiceService invoiceService;

    @GetMapping("/list")
    @SaCheckPermission("office:invoice:list")
    public R<PageResult<OaInvoice>> list(OaInvoice query, PageQuery pageQuery) {
        return R.ok(invoiceService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("office:invoice:list")
    public R<OaInvoice> getInfo(@PathVariable("id") Long id) {
        OaInvoice invoice = invoiceService.getById(id);
        return invoice == null || !"0".equals(invoice.getDelFlag()) ? R.fail("发票不存在") : R.ok(invoice);
    }

    @GetMapping("/{id}/writeoff/list")
    @SaCheckPermission("office:invoice:list")
    public R<List<OaInvoiceWriteoff>> writeoffList(@PathVariable("id") Long id) {
        try {
            return R.ok(invoiceService.listWriteoffHistory(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增发票")
    @PostMapping
    @SaCheckPermission("office:invoice:add")
    public R<Void> add(@RequestBody OaInvoice invoice) {
        try {
            return R.result(invoiceService.createInvoice(invoice));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改发票")
    @PutMapping
    @SaCheckPermission("office:invoice:edit")
    public R<Void> edit(@RequestBody OaInvoice invoice) {
        try {
            return R.result(invoiceService.updateInvoice(invoice));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定发票业务单据")
    @PutMapping("/bind/{id}")
    @SaCheckPermission("office:invoice:bind")
    public R<Void> bind(@PathVariable("id") Long id, @RequestBody OaInvoice invoice) {
        try {
            return R.result(invoiceService.bindInvoice(id, invoice));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("核销发票")
    @PostMapping("/{id}/writeoff")
    @SaCheckPermission("office:invoice:writeoff")
    public R<Void> writeoff(@PathVariable("id") Long id, @RequestBody OaInvoiceWriteoff writeoff) {
        try {
            writeoff.setInvoiceId(id);
            return R.result(invoiceService.writeoffInvoice(writeoff));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("作废发票")
    @PostMapping("/{id}/void")
    @SaCheckPermission("office:invoice:void")
    public R<Void> voidInvoice(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, String> body) {
        try {
            return R.result(invoiceService.voidInvoice(id, body == null ? null : body.get("remark")));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除发票")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("office:invoice:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            OaInvoice invoice = new OaInvoice();
            invoice.setInvoiceId(id);
            invoice.setDelFlag("1");
            invoiceService.updateById(invoice);
        }
        return R.ok();
    }
}

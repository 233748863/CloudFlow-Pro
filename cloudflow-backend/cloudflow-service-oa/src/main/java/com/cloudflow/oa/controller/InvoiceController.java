package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.OaInvoice;
import com.cloudflow.oa.domain.OaInvoiceWriteoff;
import com.cloudflow.oa.service.IOaInvoiceService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/invoice")
@RequiredArgsConstructor
public class InvoiceController {

    private final IOaInvoiceService oaInvoiceService;

    @GetMapping("/list")
    @SaCheckPermission("oa:invoice:list")
    public R<PageResult<OaInvoice>> list(OaInvoice query, PageQuery pageQuery) {
        return R.ok(oaInvoiceService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:invoice:list")
    public R<OaInvoice> getInfo(@PathVariable("id") Long id) {
        OaInvoice invoice = oaInvoiceService.getById(id);
        return invoice == null || !Integer.valueOf(0).equals(invoice.getDeleted()) ? R.fail("发票不存在") : R.ok(invoice);
    }

    @GetMapping("/{id}/writeoff/list")
    @SaCheckPermission("oa:invoice:list")
    public R<List<OaInvoiceWriteoff>> writeoffList(@PathVariable("id") Long id) {
        try {
            return R.ok(oaInvoiceService.listWriteoffHistory(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增发票")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:invoice:add")
    public R<Void> add(@RequestBody OaInvoice invoice) {
        try {
            return R.result(oaInvoiceService.createInvoice(invoice));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改发票")
    @PutMapping
    @SaCheckPermission("oa:invoice:edit")
    public R<Void> edit(@RequestBody OaInvoice invoice) {
        try {
            return R.result(oaInvoiceService.updateInvoice(invoice));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("绑定发票业务单据")
    @PutMapping("/bind/{id}")
    @SaCheckPermission("oa:invoice:bind")
    public R<Void> bind(@PathVariable("id") Long id, @RequestBody OaInvoice invoice) {
        try {
            return R.result(oaInvoiceService.bindInvoice(id, invoice));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("核销发票")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/writeoff")
    @SaCheckPermission("oa:invoice:writeoff")
    public R<Void> writeoff(@PathVariable("id") Long id, @RequestBody OaInvoiceWriteoff writeoff) {
        try {
            writeoff.setInvoiceId(id);
            return R.result(oaInvoiceService.writeoffInvoice(writeoff));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("作废发票")
    @RepeatSubmit
    @PostMapping("/{id}/void")
    @SaCheckPermission("oa:invoice:void")
    public R<Void> voidInvoice(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, String> body) {
        try {
            return R.result(oaInvoiceService.voidInvoice(id, body == null ? null : body.get("remark")));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除发票")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("oa:invoice:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            OaInvoice invoice = new OaInvoice();
            invoice.setInvoiceId(id);
            invoice.setDeleted(1);
            oaInvoiceService.updateById(invoice);
        }
        return R.ok();
    }
}


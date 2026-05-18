package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.service.ICrmQuoteService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/quote")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmQuoteController {

    private final ICrmQuoteService quoteService;

    @GetMapping("/list")
    @SaCheckPermission("crm:quote:list")
    public R<PageResult<CrmQuote>> list(CrmQuote query, PageQuery pageQuery) {
        return R.ok(quoteService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:quote:list")
    public R<CrmQuote> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(quoteService.getQuoteDetail(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增CRM报价")
    @PostMapping
    @SaCheckPermission("crm:quote:add")
    public R<Void> add(@RequestBody CrmQuote quote) {
        try {
            return R.result(quoteService.createQuote(quote));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM报价")
    @PutMapping
    @SaCheckPermission("crm:quote:edit")
    public R<Void> edit(@RequestBody CrmQuote quote) {
        try {
            return R.result(quoteService.updateQuote(quote));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交CRM报价审批")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("crm:quote:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(quoteService.submitQuote(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("发送CRM报价")
    @PostMapping("/{id}/send")
    @SaCheckPermission("crm:quote:send")
    public R<Void> send(@PathVariable("id") Long id) {
        try {
            return R.result(quoteService.sendQuote(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("接受CRM报价")
    @PostMapping("/{id}/accept")
    @SaCheckPermission("crm:quote:accept")
    public R<Void> accept(@PathVariable("id") Long id) {
        try {
            return R.result(quoteService.acceptQuote(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM报价过期")
    @PostMapping("/{id}/expire")
    @SaCheckPermission("crm:quote:expire")
    public R<Void> expire(@PathVariable("id") Long id) {
        try {
            return R.result(quoteService.expireQuote(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("CRM报价生成合同草稿")
    @PostMapping("/{id}/contract-draft")
    @SaCheckPermission("crm:contract:draft")
    public R<Long> createContractDraft(@PathVariable("id") Long id) {
        try {
            return R.ok(quoteService.createContractDraft(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM报价")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:quote:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            try {
                quoteService.getAccessibleQuote(id);
            } catch (IllegalArgumentException e) {
                return R.fail(e.getMessage());
            }
            CrmQuote quote = new CrmQuote();
            quote.setQuoteId(id);
            quote.setDeleted(1);
            quoteService.updateById(quote);
        }
        return R.ok();
    }
}

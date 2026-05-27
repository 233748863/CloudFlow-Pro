package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmPriceBook;
import com.cloudflow.crm.service.ICrmPriceBookService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/price-book")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmPriceBookController {

    private final ICrmPriceBookService crmPriceBookService;

    @GetMapping("/list")
    @SaCheckPermission("crm:price-book:list")
    public R<PageResult<CrmPriceBook>> list(CrmPriceBook query, PageQuery pageQuery) {
        return R.ok(crmPriceBookService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:price-book:list")
    public R<CrmPriceBook> getInfo(@PathVariable("id") Long id) {
        CrmPriceBook priceBook = crmPriceBookService.getById(id);
        return priceBook == null || !Integer.valueOf(0).equals(priceBook.getDeleted()) ? R.fail("价目表不存在") : R.ok(priceBook);
    }

    @SysLog("新增CRM价目表")
    @PostMapping
    @SaCheckPermission("crm:price-book:add")
    public R<Void> add(@RequestBody CrmPriceBook priceBook) {
        try {
            return R.result(crmPriceBookService.createPriceBook(priceBook));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM价目表")
    @PutMapping
    @SaCheckPermission("crm:price-book:edit")
    public R<Void> edit(@RequestBody CrmPriceBook priceBook) {
        try {
            return R.result(crmPriceBookService.updatePriceBook(priceBook));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM价目表")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:price-book:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmPriceBook priceBook = new CrmPriceBook();
            priceBook.setPriceBookId(id);
            priceBook.setDeleted(1);
            crmPriceBookService.updateById(priceBook);
        }
        return R.ok();
    }
}

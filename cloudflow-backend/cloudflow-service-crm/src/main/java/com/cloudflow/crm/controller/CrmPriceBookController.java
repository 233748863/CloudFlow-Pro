package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmPriceBook;
import com.cloudflow.crm.service.ICrmPriceBookService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/price-book")
@RequiredArgsConstructor
public class CrmPriceBookController {

    private final ICrmPriceBookService priceBookService;

    @GetMapping("/list")
    public R<PageResult<CrmPriceBook>> list(CrmPriceBook query, PageQuery pageQuery) {
        return R.ok(priceBookService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmPriceBook> getInfo(@PathVariable("id") Long id) {
        CrmPriceBook priceBook = priceBookService.getById(id);
        return priceBook == null || !"0".equals(priceBook.getDelFlag()) ? R.fail("价目表不存在") : R.ok(priceBook);
    }

    @SysLog("新增CRM价目表")
    @PostMapping
    public R<Void> add(@RequestBody CrmPriceBook priceBook) {
        try {
            return R.result(priceBookService.createPriceBook(priceBook));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM价目表")
    @PutMapping
    public R<Void> edit(@RequestBody CrmPriceBook priceBook) {
        try {
            return R.result(priceBookService.updatePriceBook(priceBook));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM价目表")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmPriceBook priceBook = new CrmPriceBook();
            priceBook.setPriceBookId(id);
            priceBook.setDelFlag("1");
            priceBookService.updateById(priceBook);
        }
        return R.ok();
    }
}

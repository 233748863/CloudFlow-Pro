package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmProduct;
import com.cloudflow.crm.service.ICrmProductService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/product")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmProductController {

    private final ICrmProductService crmProductService;

    @GetMapping("/list")
    @SaCheckPermission("crm:product:list")
    public R<PageResult<CrmProduct>> list(CrmProduct query, PageQuery pageQuery) {
        return R.ok(crmProductService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:product:list")
    public R<CrmProduct> getInfo(@PathVariable("id") Long id) {
        CrmProduct product = crmProductService.getById(id);
        return product == null || !Integer.valueOf(0).equals(product.getDeleted()) ? R.fail("产品不存在") : R.ok(product);
    }

    @SysLog("新增CRM产品")
    @PostMapping
    @SaCheckPermission("crm:product:add")
    public R<Void> add(@RequestBody CrmProduct product) {
        try {
            return R.result(crmProductService.createProduct(product));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM产品")
    @PutMapping
    @SaCheckPermission("crm:product:edit")
    public R<Void> edit(@RequestBody CrmProduct product) {
        try {
            return R.result(crmProductService.updateProduct(product));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM产品")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:product:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmProduct product = new CrmProduct();
            product.setProductId(id);
            product.setDeleted(1);
            crmProductService.updateById(product);
        }
        return R.ok();
    }
}

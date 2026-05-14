package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.service.ICrmRenewalService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/renewal")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmRenewalController {

    private final ICrmRenewalService renewalService;
    private final com.cloudflow.crm.service.ICrmCustomerService customerService;

    @GetMapping("/list")
    @SaCheckPermission("crm:renewal:list")
    public R<PageResult<CrmRenewal>> list(CrmRenewal query, PageQuery pageQuery) {
        return R.ok(renewalService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:renewal:list")
    public R<CrmRenewal> getInfo(@PathVariable("id") Long id) {
        CrmRenewal renewal = renewalService.getRenewalInfo(id);
        return renewal == null || !"0".equals(renewal.getDelFlag()) ? R.fail("续约记录不存在") : R.ok(renewal);
    }

    @SysLog("新增CRM续约")
    @PostMapping
    @SaCheckPermission("crm:renewal:add")
    public R<Void> add(@RequestBody CrmRenewal renewal) {
        try {
            return R.result(renewalService.createRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM续约")
    @PutMapping
    @SaCheckPermission("crm:renewal:edit")
    public R<Void> edit(@RequestBody CrmRenewal renewal) {
        try {
            return R.result(renewalService.updateRenewal(renewal));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("提交CRM续约审批")
    @PostMapping("/submit/{id}")
    @SaCheckPermission("crm:renewal:submit")
    public R<Void> submit(@PathVariable("id") Long id) {
        try {
            return R.result(renewalService.submitRenewal(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM续约")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:renewal:remove")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmRenewal persisted = renewalService.getById(id);
            CrmRenewal renewal = new CrmRenewal();
            renewal.setRenewalId(id);
            renewal.setDelFlag("1");
            renewalService.updateById(renewal);
            if (persisted != null) {
                customerService.refreshHealth(persisted.getCustomerId());
            }
        }
        return R.ok();
    }
}

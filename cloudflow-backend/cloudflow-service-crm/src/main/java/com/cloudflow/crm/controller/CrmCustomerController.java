package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.service.ICrmCustomerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/customer")
@RequiredArgsConstructor
public class CrmCustomerController {

    private final ICrmCustomerService customerService;

    @GetMapping("/list")
    public R<PageResult<CrmCustomer>> list(CrmCustomer query, PageQuery pageQuery) {
        return R.ok(customerService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    public R<CrmCustomer> getInfo(@PathVariable("id") Long id) {
        CrmCustomer customer = customerService.getById(id);
        return customer == null || !"0".equals(customer.getDelFlag()) ? R.fail("客户不存在") : R.ok(customer);
    }

    @GetMapping("/{id}/workspace")
    public R<CrmCustomerWorkspaceVO> workspace(@PathVariable("id") Long id) {
        try {
            return R.ok(customerService.getWorkspace(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/dashboard/summary")
    public R<CrmDashboardSummaryVO> dashboardSummary() {
        return R.ok(customerService.getDashboardSummary());
    }

    @SysLog("新增CRM客户")
    @PostMapping
    public R<Void> add(@RequestBody CrmCustomer customer) {
        try {
            return R.result(customerService.createCustomer(customer));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM客户")
    @PutMapping
    public R<Void> edit(@RequestBody CrmCustomer customer) {
        try {
            return R.result(customerService.updateCustomer(customer));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM客户")
    @DeleteMapping("/{ids}")
    public R<Void> remove(@PathVariable("ids") List<Long> ids) {
        for (Long id : ids) {
            CrmCustomer customer = new CrmCustomer();
            customer.setCustomerId(id);
            customer.setDelFlag("1");
            customerService.updateById(customer);
        }
        return R.ok();
    }
}

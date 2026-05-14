package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmCustomerPoolLog;
import com.cloudflow.crm.domain.dto.CrmCustomerAssignDTO;
import com.cloudflow.crm.service.ICrmCustomerPoolService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/customer-pool")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmCustomerPoolController {

    private final ICrmCustomerPoolService customerPoolService;

    @GetMapping("/list")
    @SaCheckPermission("crm:customer-pool:list")
    public R<PageResult<CrmCustomer>> list(CrmCustomer query, PageQuery pageQuery) {
        return R.ok(customerPoolService.queryPool(query, pageQuery));
    }

    @GetMapping("/logs")
    @SaCheckPermission("crm:customer-pool:list")
    public R<PageResult<CrmCustomerPoolLog>> logs(@RequestParam(value = "customerId", required = false) Long customerId,
                                                   PageQuery pageQuery) {
        return R.ok(customerPoolService.listLogs(customerId, pageQuery));
    }

    @SysLog("释放客户到公海")
    @PostMapping("/{customerId}/release")
    @SaCheckPermission("crm:customer-pool:release")
    public R<Void> release(@PathVariable("customerId") Long customerId,
                           @RequestBody(required = false) Map<String, String> body) {
        try {
            String reason = body == null ? null : body.get("reason");
            return R.result(customerPoolService.releaseToPool(customerId, reason));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("从公海抢单")
    @PostMapping("/{customerId}/claim")
    @SaCheckPermission("crm:customer-pool:claim")
    public R<Void> claim(@PathVariable("customerId") Long customerId,
                         @RequestBody(required = false) Map<String, String> body) {
        try {
            String reason = body == null ? null : body.get("reason");
            return R.result(customerPoolService.claimFromPool(customerId, reason));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("指派公海客户")
    @PostMapping("/assign")
    @SaCheckPermission("crm:customer-pool:assign")
    public R<Void> assign(@RequestBody CrmCustomerAssignDTO assignDTO) {
        try {
            return R.result(customerPoolService.assignFromPool(assignDTO));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("触发客户自动回收")
    @PostMapping("/auto-release")
    @SaCheckPermission("crm:customer-pool:auto-release")
    public R<Integer> autoRelease() {
        return R.ok(customerPoolService.triggerAutoRelease());
    }
}

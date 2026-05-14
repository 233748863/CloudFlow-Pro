package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.vo.CrmCustomerWorkspaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.service.ICrmCrossModuleDraftService;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmCustomerWorkspaceService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/customer")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmCustomerController {

    private final ICrmCustomerService customerService;
    private final ICrmCustomerWorkspaceService workspaceService;
    private final ICrmCrossModuleDraftService crossModuleDraftService;

    @GetMapping("/list")
    @SaCheckPermission("crm:customer:list")
    public R<PageResult<CrmCustomer>> list(CrmCustomer query, PageQuery pageQuery) {
        return R.ok(customerService.queryPage(query, pageQuery));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:customer:list")
    public R<CrmCustomer> getInfo(@PathVariable("id") Long id) {
        try {
            return R.ok(customerService.getAccessibleCustomer(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/{id}/workspace")
    @SaCheckPermission("crm:customer:list")
    public R<CrmCustomerWorkspaceVO> workspace(@PathVariable("id") Long id) {
        try {
            return R.ok(workspaceService.getWorkspace(id));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @GetMapping("/dashboard/summary")
    @SaCheckPermission("crm:dashboard:view")
    public R<CrmDashboardSummaryVO> dashboardSummary() {
        return R.ok(workspaceService.getDashboardSummary());
    }

    @PostMapping("/{id}/workspace/contract-draft")
    @SaCheckPermission("crm:contract:draft")
    public R<Long> createWorkspaceContractDraft(@PathVariable("id") Long id,
                                                @RequestBody RemoteOaService.ContractDraftRequest request) {
        try {
            return R.ok(crossModuleDraftService.createContractDraft(id, request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/workspace/project-draft")
    @SaCheckPermission("crm:project:draft")
    public R<Long> createWorkspaceProjectDraft(@PathVariable("id") Long id,
                                               @RequestBody RemoteOaService.ProjectDraftRequest request) {
        try {
            return R.ok(crossModuleDraftService.createProjectDraft(id, request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/workspace/budget-draft")
    @SaCheckPermission("crm:budget:draft")
    public R<Void> createWorkspaceBudgetDraft(@PathVariable("id") Long id,
                                              @RequestBody RemoteOaService.BudgetDraftRequest request) {
        try {
            return R.result(crossModuleDraftService.createBudgetDraft(id, request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/workspace/invoice-draft")
    @SaCheckPermission("crm:invoice:draft")
    public R<Void> createWorkspaceInvoiceDraft(@PathVariable("id") Long id,
                                               @RequestBody RemoteOaService.InvoiceDraftRequest request) {
        try {
            return R.result(crossModuleDraftService.createInvoiceDraft(id, request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PutMapping("/{id}/workspace/invoice/{invoiceId}/bind")
    @SaCheckPermission("crm:invoice:bind")
    public R<Void> bindWorkspaceInvoice(@PathVariable("id") Long id,
                                        @PathVariable("invoiceId") Long invoiceId,
                                        @RequestBody RemoteOaService.InvoiceBindRequest request) {
        try {
            return R.result(crossModuleDraftService.bindInvoice(id, invoiceId, request));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/workspace/invoice/{invoiceId}/void")
    @SaCheckPermission("crm:invoice:void")
    public R<Void> voidWorkspaceInvoice(@PathVariable("id") Long id,
                                        @PathVariable("invoiceId") Long invoiceId,
                                        @RequestBody(required = false) Map<String, String> body) {
        try {
            return R.result(crossModuleDraftService.voidInvoice(id, invoiceId, body == null ? null : body.get("remark")));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/workspace/receivable/{receivableId}/confirm")
    @SaCheckPermission("crm:receivable:confirm")
    public R<Void> confirmWorkspaceReceivable(@PathVariable("id") Long id,
                                              @PathVariable("receivableId") Long receivableId) {
        try {
            return R.result(crossModuleDraftService.confirmReceivable(id, receivableId));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("新增CRM客户")
    @PostMapping
    @SaCheckPermission("crm:customer:add")
    public R<Void> add(@RequestBody CrmCustomer customer) {
        try {
            return R.result(customerService.createCustomer(customer));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改CRM客户")
    @PutMapping
    @SaCheckPermission("crm:customer:edit")
    public R<Void> edit(@RequestBody CrmCustomer customer) {
        try {
            return R.result(customerService.updateCustomer(customer));
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("删除CRM客户")
    @DeleteMapping("/{ids}")
    @SaCheckPermission("crm:customer:remove")
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

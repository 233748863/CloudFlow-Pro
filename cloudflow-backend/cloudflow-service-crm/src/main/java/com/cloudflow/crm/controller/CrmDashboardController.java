package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.domain.vo.CrmDashboardWorkplaceVO;
import com.cloudflow.crm.service.ICrmCustomerWorkspaceService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/dashboard")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmDashboardController {

    private final ICrmCustomerWorkspaceService crmCustomerWorkspaceService;

    @GetMapping("/summary")
    @SaCheckPermission("crm:dashboard:view")
    public R<CrmDashboardSummaryVO> summary() {
        return R.ok(crmCustomerWorkspaceService.getDashboardSummary());
    }

    @GetMapping("/workplace")
    @SaCheckPermission("crm:dashboard:view")
    public R<CrmDashboardWorkplaceVO> workplace() {
        return R.ok(crmCustomerWorkspaceService.getDashboardWorkplace());
    }
}

package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.vo.CrmDashboardWorkplaceVO;
import com.cloudflow.crm.domain.vo.CrmDashboardSummaryVO;
import com.cloudflow.crm.service.ICrmCustomerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/dashboard")
@RequiredArgsConstructor
public class CrmDashboardController {

    private final ICrmCustomerService customerService;

    @GetMapping("/summary")
    public R<CrmDashboardSummaryVO> summary() {
        return R.ok(customerService.getDashboardSummary());
    }

    @GetMapping("/workplace")
    public R<CrmDashboardWorkplaceVO> workplace() {
        return R.ok(customerService.getDashboardWorkplace());
    }
}

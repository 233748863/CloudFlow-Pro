package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.OaBorrowManagementStatsDTO;
import com.cloudflow.oa.domain.dto.OaBorrowManagementSummaryDTO;
import com.cloudflow.oa.service.IOaBorrowManagementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 用印/证照借还聚合管理 Controller。
 */
@RestController
@RequestMapping("/borrow-management")
@RequiredArgsConstructor
@SaCheckRole(value = {"admin", "manager"}, mode = SaMode.OR)
public class BorrowManagementController {

    private final IOaBorrowManagementService borrowManagementService;

    @GetMapping("/summary")
    public R<OaBorrowManagementSummaryDTO> summary() {
        return R.ok(borrowManagementService.getSummary());
    }

    @GetMapping("/stats")
    public R<OaBorrowManagementStatsDTO> stats() {
        return R.ok(borrowManagementService.getStats());
    }
}

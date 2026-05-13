package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.service.CrmApprovalService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.Map;

/**
 * CRM 通用审批入口：客户领取/公海释放、商机降级关闭、客户分级变更、退款。
 */
@RestController
@RequestMapping("/approval")
@RequiredArgsConstructor
public class CrmApprovalController {

    private final CrmApprovalService approvalService;

    @PostMapping("/customer-claim")
    public R<Long> submitCustomerClaim(@RequestBody Map<String, Object> body) {
        try {
            Long customerId = toLong(body.get("customerId"));
            String action = String.valueOf(body.getOrDefault("action", ""));
            String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark"));
            return R.ok(approvalService.submitCustomerClaim(customerId, action, remark));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/customer-level")
    public R<Long> submitCustomerLevelChange(@RequestBody Map<String, Object> body) {
        try {
            Long customerId = toLong(body.get("customerId"));
            String action = String.valueOf(body.getOrDefault("action", ""));
            String targetLevel = body.get("targetLevel") == null ? null : String.valueOf(body.get("targetLevel"));
            String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark"));
            return R.ok(approvalService.submitCustomerLevelChange(customerId, action, targetLevel, remark));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/opportunity-downgrade")
    public R<Long> submitOpportunityDowngrade(@RequestBody Map<String, Object> body) {
        try {
            Long opportunityId = toLong(body.get("opportunityId"));
            String action = String.valueOf(body.getOrDefault("action", ""));
            String targetStage = body.get("targetStage") == null ? null : String.valueOf(body.get("targetStage"));
            String lostReason = body.get("lostReason") == null ? null : String.valueOf(body.get("lostReason"));
            return R.ok(approvalService.submitOpportunityDowngrade(opportunityId, action, targetStage, lostReason));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/refund")
    public R<Long> submitRefund(@RequestBody Map<String, Object> body) {
        try {
            Long receivableId = toLong(body.get("receivableId"));
            BigDecimal refundAmount = body.get("refundAmount") == null ? null : new BigDecimal(String.valueOf(body.get("refundAmount")));
            String reason = body.get("reason") == null ? null : String.valueOf(body.get("reason"));
            return R.ok(approvalService.submitRefund(receivableId, refundAmount, reason));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @GetMapping("/{id}")
    public R<CrmApproval> getInfo(@PathVariable("id") Long id) {
        return R.ok(approvalService.getById(id));
    }

    private Long toLong(Object value) {
        if (value == null) return null;
        return Long.valueOf(String.valueOf(value));
    }
}

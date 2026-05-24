package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.dto.approval.CrmCustomerClaimSubmitDTO;
import com.cloudflow.crm.domain.dto.approval.CrmCustomerLevelChangeSubmitDTO;
import com.cloudflow.crm.domain.dto.approval.CrmOpportunityDowngradeSubmitDTO;
import com.cloudflow.crm.domain.dto.approval.CrmRefundSubmitDTO;
import com.cloudflow.crm.domain.vo.CrmApprovalVO;
import com.cloudflow.crm.service.CrmApprovalService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * CRM 通用审批入口：客户领取/公海释放、商机降级关闭、客户分级变更、退款。
 */
@RestController
@RequestMapping("/approval")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmApprovalController {

    private final CrmApprovalService approvalService;
    private final ObjectMapper objectMapper;

    @PostMapping("/customer-claim")
    @SaCheckPermission("crm:approval:customer-claim")
    public R<Long> submitCustomerClaim(@Validated @RequestBody CrmCustomerClaimSubmitDTO dto) {
        try {
            return R.ok(approvalService.submitCustomerClaim(dto.getCustomerId(), dto.getAction(), dto.getRemark()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/customer-level")
    @SaCheckPermission("crm:approval:customer-level")
    public R<Long> submitCustomerLevelChange(@Validated @RequestBody CrmCustomerLevelChangeSubmitDTO dto) {
        try {
            return R.ok(approvalService.submitCustomerLevelChange(dto.getCustomerId(), dto.getAction(),
                    dto.getTargetLevel(), dto.getRemark()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/opportunity-downgrade")
    @SaCheckPermission("crm:approval:opportunity-downgrade")
    public R<Long> submitOpportunityDowngrade(@Validated @RequestBody CrmOpportunityDowngradeSubmitDTO dto) {
        try {
            return R.ok(approvalService.submitOpportunityDowngrade(dto.getOpportunityId(), dto.getAction(),
                    dto.getTargetStage(), dto.getLostReason()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/refund")
    @SaCheckPermission("crm:approval:refund")
    public R<Long> submitRefund(@Validated @RequestBody CrmRefundSubmitDTO dto) {
        try {
            return R.ok(approvalService.submitRefund(dto.getReceivableId(), dto.getRefundAmount(), dto.getReason()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:approval:query")
    public R<CrmApprovalVO> getInfo(@PathVariable("id") Long id) {
        return R.ok(objectMapper.convertValue(approvalService.getById(id), CrmApprovalVO.class));
    }
}

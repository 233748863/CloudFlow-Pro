package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.crm.domain.dto.approval.CrmCustomerClaimSubmitDTO;
import com.cloudflow.crm.domain.dto.approval.CrmCustomerLevelChangeSubmitDTO;
import com.cloudflow.crm.domain.dto.approval.CrmOpportunityDowngradeSubmitDTO;
import com.cloudflow.crm.domain.dto.approval.CrmRefundSubmitDTO;
import com.cloudflow.crm.domain.vo.CrmApprovalVO;
import com.cloudflow.crm.service.ICrmApprovalService;
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

    private final ICrmApprovalService crmApprovalService;
    private final ObjectMapper objectMapper;

    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/customer-claim")
    @SaCheckPermission("crm:approval:customer-claim")
    public R<Long> submitCustomerClaim(@Validated @RequestBody CrmCustomerClaimSubmitDTO dto) {
        try {
            return R.ok(crmApprovalService.submitCustomerClaim(dto.getCustomerId(), dto.getAction(), dto.getRemark()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/customer-level")
    @SaCheckPermission("crm:approval:customer-level")
    public R<Long> submitCustomerLevelChange(@Validated @RequestBody CrmCustomerLevelChangeSubmitDTO dto) {
        try {
            return R.ok(crmApprovalService.submitCustomerLevelChange(dto.getCustomerId(), dto.getAction(),
                    dto.getTargetLevel(), dto.getRemark()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/opportunity-downgrade")
    @SaCheckPermission("crm:approval:opportunity-downgrade")
    public R<Long> submitOpportunityDowngrade(@Validated @RequestBody CrmOpportunityDowngradeSubmitDTO dto) {
        try {
            return R.ok(crmApprovalService.submitOpportunityDowngrade(dto.getOpportunityId(), dto.getAction(),
                    dto.getTargetStage(), dto.getLostReason()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/refund")
    @SaCheckPermission("crm:approval:refund")
    public R<Long> submitRefund(@Validated @RequestBody CrmRefundSubmitDTO dto) {
        try {
            return R.ok(crmApprovalService.submitRefund(dto.getReceivableId(), dto.getRefundAmount(), dto.getReason()));
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @GetMapping("/{id}")
    @SaCheckPermission("crm:approval:query")
    public R<CrmApprovalVO> getInfo(@PathVariable("id") Long id) {
        return R.ok(objectMapper.convertValue(crmApprovalService.getById(id), CrmApprovalVO.class));
    }
}

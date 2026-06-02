package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.security.UserDeletionGuard;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.mapper.BusinessTripMapper;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class OaUserDeletionGuard implements UserDeletionGuard {

    private final BizExpenseClaimMapper bizExpenseClaimMapper;
    private final BizPaymentRequestMapper bizPaymentRequestMapper;
    private final BizPurchaseRequestMapper bizPurchaseRequestMapper;
    private final BusinessTripMapper businessTripMapper;
    private final OaLicenseBorrowMapper oaLicenseBorrowMapper;
    private final OaSealApplicationMapper oaSealApplicationMapper;
    private final VehicleUsageMapper vehicleUsageMapper;

    @Override
    public List<String> findBlockingReferences(Long userId) {
        List<String> result = new ArrayList<>();
        addIfPresent(result, "OA报销单", bizExpenseClaimMapper.selectCount(
                new LambdaQueryWrapper<BizExpenseClaim>()
                        .eq(BizExpenseClaim::getUserId, userId)
                        .in(BizExpenseClaim::getStatus, List.of("DRAFT", "PENDING"))));
        addIfPresent(result, "OA付款申请", bizPaymentRequestMapper.selectCount(
                new LambdaQueryWrapper<BizPaymentRequest>()
                        .eq(BizPaymentRequest::getUserId, userId)
                        .in(BizPaymentRequest::getStatus, List.of("DRAFT", "PENDING"))));
        addIfPresent(result, "OA采购申请", bizPurchaseRequestMapper.selectCount(
                new LambdaQueryWrapper<BizPurchaseRequest>()
                        .eq(BizPurchaseRequest::getUserId, userId)
                        .in(BizPurchaseRequest::getStatus, List.of("DRAFT", "PENDING"))));
        addIfPresent(result, "OA出差申请", businessTripMapper.selectCount(
                new LambdaQueryWrapper<BusinessTrip>()
                        .eq(BusinessTrip::getUserId, userId)
                        .in(BusinessTrip::getStatus, List.of("DRAFT", "PENDING"))));
        addIfPresent(result, "OA用印申请", oaSealApplicationMapper.selectCount(
                new LambdaQueryWrapper<OaSealApplication>()
                        .eq(OaSealApplication::getUserId, userId)
                        .in(OaSealApplication::getStatus, List.of("DRAFT", "PENDING", "APPROVED", "BORROWED", "OVERDUE"))));
        addIfPresent(result, "OA证照借用", oaLicenseBorrowMapper.selectCount(
                new LambdaQueryWrapper<OaLicenseBorrow>()
                        .eq(OaLicenseBorrow::getUserId, userId)
                        .in(OaLicenseBorrow::getStatus, List.of("DRAFT", "PENDING", "APPROVED", "BORROWED", "OVERDUE"))));
        addIfPresent(result, "OA派车申请", vehicleUsageMapper.selectCount(
                new LambdaQueryWrapper<VehicleUsage>()
                        .eq(VehicleUsage::getApplicantId, userId)
                        .in(VehicleUsage::getStatus, List.of("0", "1", "3"))));
        return result;
    }

    private void addIfPresent(List<String> result, String label, Long count) {
        if (count != null && count > 0) {
            result.add(label + " " + count + " 条");
        }
    }
}

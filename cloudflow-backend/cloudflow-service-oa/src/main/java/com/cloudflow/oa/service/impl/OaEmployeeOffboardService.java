package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.BizPurchaseItem;
import com.cloudflow.oa.domain.BusinessTrip;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.mapper.BusinessTripMapper;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import com.cloudflow.oa.service.IOaBudgetService;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.cloudflow.oa.service.IPurchaseRequestService;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.VehicleConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class OaEmployeeOffboardService {

    private static final String AUTO_CANCEL_OPERATOR = "hr-employee-left";

    private final BusinessTripMapper businessTripMapper;
    private final BizExpenseClaimMapper bizExpenseClaimMapper;
    private final BizPurchaseRequestMapper bizPurchaseRequestMapper;
    private final OaSealApplicationMapper oaSealApplicationMapper;
    private final OaLicenseBorrowMapper oaLicenseBorrowMapper;
    private final VehicleUsageMapper vehicleUsageMapper;
    private final IExpenseClaimService expenseClaimService;
    private final IPurchaseRequestService purchaseRequestService;
    private final IOaBudgetService oaBudgetService;

    @Transactional(rollbackFor = Exception.class)
    public void cancelPendingDocumentsForEmployeeLeft(Long tenantId, Long userId, String sourceEventId) {
        int tripCount = cancelTrips(tenantId, userId);
        int sealCount = cancelSealApplications(tenantId, userId);
        int licenseCount = cancelLicenseBorrows(tenantId, userId);
        int vehicleCount = cancelVehicleUsages(tenantId, userId);
        int expenseCount = cancelExpenseClaims(tenantId, userId);
        int purchaseCount = cancelPurchaseRequests(tenantId, userId);

        if (expenseCount > 0 || purchaseCount > 0) {
            log.info("oa employee-left auto-cancel completed for additional business forms, eventId={}, tenantId={}, userId={}, expenseCount={}, purchaseCount={}",
                    sourceEventId, tenantId, userId, expenseCount, purchaseCount);
        }

        log.info("oa employee-left auto-cancel completed, eventId={}, tenantId={}, userId={}, tripCount={}, sealCount={}, licenseCount={}, vehicleCount={}, untouchedExpenseCount={}, untouchedPurchaseCount={}",
                sourceEventId, tenantId, userId, tripCount, sealCount, licenseCount, vehicleCount, expenseCount, purchaseCount);
    }

    private int cancelTrips(Long tenantId, Long userId) {
        return businessTripMapper.update(null, new LambdaUpdateWrapper<BusinessTrip>()
                .eq(BusinessTrip::getTenantId, tenantId)
                .eq(BusinessTrip::getUserId, userId)
                .eq(BusinessTrip::getDeleted, 0)
                .in(BusinessTrip::getStatus, List.of("DRAFT", "PENDING"))
                .set(BusinessTrip::getStatus, "CANCELLED")
                .set(BusinessTrip::getUpdateBy, AUTO_CANCEL_OPERATOR)
                .set(BusinessTrip::getUpdateTime, java.time.LocalDateTime.now()));
    }

    private int cancelSealApplications(Long tenantId, Long userId) {
        return oaSealApplicationMapper.update(null, new LambdaUpdateWrapper<OaSealApplication>()
                .eq(OaSealApplication::getTenantId, tenantId)
                .eq(OaSealApplication::getUserId, userId)
                .eq(OaSealApplication::getDeleted, 0)
                .in(OaSealApplication::getStatus, List.of(OaBorrowConstants.STATUS_DRAFT, OaBorrowConstants.STATUS_PENDING))
                .set(OaSealApplication::getStatus, OaBorrowConstants.STATUS_CANCELLED)
                .set(OaSealApplication::getUpdateBy, AUTO_CANCEL_OPERATOR)
                .set(OaSealApplication::getUpdateTime, java.time.LocalDateTime.now()));
    }

    private int cancelLicenseBorrows(Long tenantId, Long userId) {
        return oaLicenseBorrowMapper.update(null, new LambdaUpdateWrapper<OaLicenseBorrow>()
                .eq(OaLicenseBorrow::getTenantId, tenantId)
                .eq(OaLicenseBorrow::getUserId, userId)
                .eq(OaLicenseBorrow::getDeleted, 0)
                .in(OaLicenseBorrow::getStatus, List.of(OaBorrowConstants.STATUS_DRAFT, OaBorrowConstants.STATUS_PENDING))
                .set(OaLicenseBorrow::getStatus, OaBorrowConstants.STATUS_CANCELLED)
                .set(OaLicenseBorrow::getUpdateBy, AUTO_CANCEL_OPERATOR)
                .set(OaLicenseBorrow::getUpdateTime, java.time.LocalDateTime.now()));
    }

    private int cancelVehicleUsages(Long tenantId, Long userId) {
        return vehicleUsageMapper.update(null, new LambdaUpdateWrapper<VehicleUsage>()
                .eq(VehicleUsage::getTenantId, tenantId)
                .eq(VehicleUsage::getApplicantId, userId)
                .eq(VehicleUsage::getDeleted, 0)
                .eq(VehicleUsage::getStatus, VehicleConstants.USAGE_STATUS_PENDING)
                .set(VehicleUsage::getStatus, VehicleConstants.USAGE_STATUS_CANCELLED)
                .set(VehicleUsage::getUpdateBy, AUTO_CANCEL_OPERATOR)
                .set(VehicleUsage::getUpdateTime, java.time.LocalDateTime.now()));
    }

    private int cancelExpenseClaims(Long tenantId, Long userId) {
        List<BizExpenseClaim> claims = bizExpenseClaimMapper.selectList(new LambdaQueryWrapper<BizExpenseClaim>()
                .eq(BizExpenseClaim::getTenantId, tenantId)
                .eq(BizExpenseClaim::getUserId, userId)
                .eq(BizExpenseClaim::getDeleted, 0)
                .in(BizExpenseClaim::getStatus, List.of("DRAFT", "PENDING")));
        int count = 0;
        for (BizExpenseClaim claim : claims) {
            if ("PENDING".equals(claim.getStatus())) {
                releaseExpenseBudget(claim.getId());
            }
            int updated = bizExpenseClaimMapper.update(null, new LambdaUpdateWrapper<BizExpenseClaim>()
                    .eq(BizExpenseClaim::getTenantId, tenantId)
                    .eq(BizExpenseClaim::getId, claim.getId())
                    .eq(BizExpenseClaim::getDeleted, 0)
                    .in(BizExpenseClaim::getStatus, List.of("DRAFT", "PENDING"))
                    .set(BizExpenseClaim::getStatus, "CANCELLED")
                    .set(BizExpenseClaim::getUpdateBy, AUTO_CANCEL_OPERATOR)
                    .set(BizExpenseClaim::getUpdateTime, java.time.LocalDateTime.now()));
            if (updated > 0) {
                count += updated;
            }
        }
        return count;
    }

    private int cancelPurchaseRequests(Long tenantId, Long userId) {
        List<BizPurchaseRequest> purchases = bizPurchaseRequestMapper.selectList(new LambdaQueryWrapper<BizPurchaseRequest>()
                .eq(BizPurchaseRequest::getTenantId, tenantId)
                .eq(BizPurchaseRequest::getUserId, userId)
                .eq(BizPurchaseRequest::getDeleted, 0)
                .in(BizPurchaseRequest::getStatus, List.of("DRAFT", "PENDING")));
        int count = 0;
        for (BizPurchaseRequest purchase : purchases) {
            if ("PENDING".equals(purchase.getStatus())) {
                purchaseRequestService.releaseBudgetOnRejected(purchase.getId());
            }
            int updated = bizPurchaseRequestMapper.update(null, new LambdaUpdateWrapper<BizPurchaseRequest>()
                    .eq(BizPurchaseRequest::getTenantId, tenantId)
                    .eq(BizPurchaseRequest::getId, purchase.getId())
                    .eq(BizPurchaseRequest::getDeleted, 0)
                    .in(BizPurchaseRequest::getStatus, List.of("DRAFT", "PENDING"))
                    .set(BizPurchaseRequest::getStatus, "CANCELLED")
                    .set(BizPurchaseRequest::getPaymentStatus, "DRAFT")
                    .set(BizPurchaseRequest::getUpdateBy, AUTO_CANCEL_OPERATOR)
                    .set(BizPurchaseRequest::getUpdateTime, java.time.LocalDateTime.now()));
            if (updated > 0) {
                count += updated;
            }
        }
        return count;
    }

    private void releaseExpenseBudget(Long claimId) {
        BizExpenseClaim claim = expenseClaimService.getClaimWithItems(claimId);
        if (claim == null) {
            return;
        }
        List<BizExpenseItem> items = claim.getItems();
        if (items == null || items.isEmpty()) {
            oaBudgetService.releaseBudget(
                    OaBusinessTypes.EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo(),
                    claim.getDeptId(),
                    claim.getDeptName(),
                    claim.getProjectId(),
                    claim.getProjectName(),
                    claim.getBudgetSubjectCode(),
                    claim.getBudgetSubjectName(),
                    claim.getTotalAmount(),
                    "申请人离职自动撤回释放预算"
            );
            return;
        }
        for (BizExpenseItem item : items) {
            oaBudgetService.releaseBudget(
                    OaBusinessTypes.EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo(),
                    claim.getDeptId(),
                    claim.getDeptName(),
                    claim.getProjectId(),
                    claim.getProjectName(),
                    item.getBudgetSubjectCode() != null && !item.getBudgetSubjectCode().isBlank() ? item.getBudgetSubjectCode() : claim.getBudgetSubjectCode(),
                    item.getBudgetSubjectName() != null && !item.getBudgetSubjectName().isBlank() ? item.getBudgetSubjectName() : claim.getBudgetSubjectName(),
                    item.getAmount(),
                    "申请人离职自动撤回释放预算"
            );
        }
    }
}

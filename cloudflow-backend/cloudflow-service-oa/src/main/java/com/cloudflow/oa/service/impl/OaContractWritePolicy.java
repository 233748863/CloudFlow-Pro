package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaContract;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import java.math.BigDecimal;
import java.util.Objects;
import java.util.Set;

public final class OaContractWritePolicy {
    private static final Set<String> DERIVED = Set.of("fulfilmentStatus", "fulfilledTermCount", "totalTermCount", "fulfilmentProgress", "signedFlag", "signMethod", "ourSigneeId", "ourSigneeName", "ourSignTime", "ourSignIp", "counterpartySignee", "counterpartySignTime", "signPlace", "signRemark", "signedFileUrl", "esignProvider", "esignTransactionId", "portalTermIds", "portalMilestoneIds", "portalPaymentScheduleIds");
    private static final Set<String> LOCKED = Set.of("amount", "currency", "counterpartyName", "supplierId", "customerId", "startDate", "endDate", "requiresFulfilmentFlag", "fulfilmentDeadline", "templateId");
    private OaContractWritePolicy() { }

    public static void initialize(OaContract contract) {
        BeanWrapper target = new BeanWrapperImpl(contract);
        for (String field : DERIVED) target.setPropertyValue(field, null);
        contract.setSignedFlag(0); contract.setFulfilmentStatus("NOT_STARTED"); contract.setFulfilledTermCount(0); contract.setTotalTermCount(0); contract.setFulfilmentProgress(BigDecimal.ZERO);
        contract.setRequiresFulfilmentFlag(OaRecordSupport.flag(contract.getRequiresFulfilmentFlag()));
    }

    public static void preserve(OaContract contract, OaContract previous) {
        BeanWrapper target = new BeanWrapperImpl(contract), original = new BeanWrapperImpl(previous);
        if (contract.getRequiresFulfilmentFlag() == null) contract.setRequiresFulfilmentFlag(previous.getRequiresFulfilmentFlag());
        if (Integer.valueOf(1).equals(previous.getSignedFlag())) {
            for (String field : LOCKED) {
                Object provided = target.getPropertyValue(field), existing = original.getPropertyValue(field);
                boolean same = provided instanceof BigDecimal actual && existing instanceof BigDecimal expected ? actual.compareTo(expected) == 0 : Objects.equals(provided, existing);
                if (provided != null && !same) throw new IllegalArgumentException("已签署合同的金额、期限、对方与模板字段已锁定");
                target.setPropertyValue(field, existing);
            }
        }
        for (String field : DERIVED) target.setPropertyValue(field, original.getPropertyValue(field));
    }
}

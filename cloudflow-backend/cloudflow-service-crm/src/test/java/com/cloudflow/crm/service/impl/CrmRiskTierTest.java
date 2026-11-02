package com.cloudflow.crm.service.impl;

import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmRenewal;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CrmRiskTierTest {
    @Test
    void renewalBatchReadsConfigurationOnceAndPreservesThresholds() {
        SysDictHelper helper = mock(SysDictHelper.class);
        when(helper.getDictData("crm_contract_expire_tier")).thenReturn(List.of(tier(2, "90"), tier(1, "30")));
        var renewals = IntStream.rangeClosed(1, 100).mapToObj(days -> {
            CrmRenewal renewal = new CrmRenewal();
            renewal.setCurrentExpireDate(LocalDate.now().plusDays(days));
            return renewal;
        }).toList();

        CrmRenewalRiskEvaluator.enrichAll(renewals, helper);

        verify(helper).getDictData("crm_contract_expire_tier");
        assertEquals(CrmConstants.RiskLevel.HIGH, renewals.get(29).getRiskLevel());
        assertEquals(CrmConstants.RiskLevel.MEDIUM, renewals.get(30).getRiskLevel());
        assertEquals(CrmConstants.RiskLevel.MEDIUM, renewals.get(89).getRiskLevel());
        assertEquals(CrmConstants.RiskLevel.LOW, renewals.get(90).getRiskLevel());
    }

    @Test
    void agingPreservesCurrentInclusiveThresholdAndFinalBucket() {
        LocalDate today = LocalDate.of(2026, 11, 2);
        var tiers = CrmHealthCalculator.sortedTiers(List.of(tier(2, "60"), tier(1, "30")));
        assertEquals("CURRENT", CrmHealthCalculator.resolveAgingBucket(today, today, tiers));
        assertEquals("DUE_TIER_1", CrmHealthCalculator.resolveAgingBucket(today.minusDays(30), today, tiers));
        assertEquals("DUE_TIER_2", CrmHealthCalculator.resolveAgingBucket(today.minusDays(31), today, tiers));
        assertEquals("DUE_TIER_2", CrmHealthCalculator.resolveAgingBucket(today.minusDays(100), today, tiers));
        assertEquals("DUE_90_PLUS", CrmHealthCalculator.resolveAgingBucket(today.minusDays(100), today, List.of()));
    }

    private SysDictHelper.DictItem tier(int sort, String value) {
        var tier = new SysDictHelper.DictItem();
        tier.setSort(sort);
        tier.setValue(value);
        return tier;
    }
}

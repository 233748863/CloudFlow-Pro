package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmRenewal;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * 续约风险评估，无状态工具。
 * 原来 {@link CrmCustomerServiceImpl} 与 {@link CrmRenewalServiceImpl} 各实现一份，
 * 抽出这里避免分叉。
 */
final class CrmRenewalRiskEvaluator {

    private CrmRenewalRiskEvaluator() {
    }

    static void enrich(CrmRenewal renewal) {
        if (renewal == null) {
            return;
        }
        String status = renewal.getStatus();
        if (CrmConstants.RenewalStatus.WON.equalsIgnoreCase(status)
                || CrmConstants.RenewalStatus.CLOSED.equalsIgnoreCase(status)) {
            renewal.setRiskLevel(CrmConstants.RiskLevel.LOW);
            renewal.setRiskReason("续约已完成");
            return;
        }
        if (CrmConstants.RenewalStatus.LOST.equalsIgnoreCase(status)) {
            renewal.setRiskLevel(CrmConstants.RiskLevel.HIGH);
            renewal.setRiskReason("续约已丢单");
            return;
        }

        LocalDate today = LocalDate.now();
        if (renewal.getCurrentExpireDate() != null) {
            long daysToExpire = ChronoUnit.DAYS.between(today, renewal.getCurrentExpireDate());
            if (daysToExpire < 0) {
                renewal.setRiskLevel(CrmConstants.RiskLevel.HIGH);
                renewal.setRiskReason("当前合同已到期");
                return;
            }
            if (daysToExpire <= 30) {
                renewal.setRiskLevel(CrmConstants.RiskLevel.HIGH);
                renewal.setRiskReason("30天内合同到期");
                return;
            }
            if (daysToExpire <= 90) {
                renewal.setRiskLevel(CrmConstants.RiskLevel.MEDIUM);
                renewal.setRiskReason("90天内合同到期");
                return;
            }
        }

        if (renewal.getExpectedSignDate() != null && renewal.getExpectedSignDate().isBefore(today)) {
            renewal.setRiskLevel(CrmConstants.RiskLevel.MEDIUM);
            renewal.setRiskReason("预计签约日期已逾期");
            return;
        }

        renewal.setRiskLevel(CrmConstants.RiskLevel.LOW);
        renewal.setRiskReason("续约节奏正常");
    }
}

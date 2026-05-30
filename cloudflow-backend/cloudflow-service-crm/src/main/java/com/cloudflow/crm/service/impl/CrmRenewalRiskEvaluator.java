package com.cloudflow.crm.service.impl;

import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmRenewal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 续约风险评估，无状态工具。
 * 原来 {@link CrmCustomerServiceImpl} 与 {@link CrmRenewalServiceImpl} 各实现一份，
 * 抽出这里避免分叉。
 */
final class CrmRenewalRiskEvaluator {

    /**
     * 合同到期分档字典类型。
     * <p>字典约定：dict_value = 本档距到期天数 <b>上限</b>（含），按升序匹配；
     * 首档 -> HIGH 风险，第二档 -> MEDIUM 风险；超出所有档则 LOW（节奏正常）。
     * 末档建议保留 99999 作为不限兜底。
     */
    private static final String EXPIRE_DICT_TYPE = "crm_contract_expire_tier";

    private CrmRenewalRiskEvaluator() {
    }

    static void enrich(CrmRenewal renewal, SysDictHelper sysDictHelper) {
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
            // 按字典 crm_contract_expire_tier 升序匹配（dict_value=本档天数上限），首档 -> HIGH，第二档 -> MEDIUM
            List<SysDictHelper.DictItem> tiers = sysDictHelper != null
                    ? sysDictHelper.getDictData(EXPIRE_DICT_TYPE)
                    : null;
            if (tiers != null && !tiers.isEmpty()) {
                List<SysDictHelper.DictItem> sorted = new ArrayList<>(tiers);
                sorted.sort(Comparator.comparing(d -> {
                    BigDecimal v = d.getValueAsDecimal();
                    return v == null ? BigDecimal.valueOf(Long.MAX_VALUE) : v;
                }));
                String[] riskLevels = {CrmConstants.RiskLevel.HIGH, CrmConstants.RiskLevel.MEDIUM};
                for (int i = 0; i < sorted.size() && i < riskLevels.length; i++) {
                    SysDictHelper.DictItem tier = sorted.get(i);
                    BigDecimal threshold = tier.getValueAsDecimal();
                    if (threshold != null && daysToExpire <= threshold.longValue()) {
                        renewal.setRiskLevel(riskLevels[i]);
                        String label = tier.getLabel();
                        renewal.setRiskReason(label != null && !label.isEmpty()
                                ? label
                                : threshold.longValue() + "天内合同到期");
                        return;
                    }
                }
            } else {
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

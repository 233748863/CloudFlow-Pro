package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportDataset;
import com.cloudflow.common.core.report.ReportQuery;
import com.cloudflow.common.core.report.ReportRegistry;
import com.cloudflow.common.core.report.ReportResult;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.core.report.ReportValidation;
import com.cloudflow.common.datascope.DataScopeHandle;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.common.report.ReportDataScope;
import com.cloudflow.common.security.report.ReportAccess;
import com.cloudflow.crm.mapper.CrmReportMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmReportService {
    private final CrmReportMapper mapper;
    private final DataScopeHandle scopeHandle;
    private final SysDictHelper dictionaries;

    public ReportResult query(String code, ReportQuery input) {
        ReportDataset dataset = ReportRegistry.require(code);
        ReportAccess.requireDataset(dataset);
        PreparedReportQuery query = ReportValidation.prepare(dataset, input, LocalDate.now());
        ReportDataScope scope = ReportDataScope.resolve(scopeHandle, DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
        List<ReportRow> rows = switch (code) {
            case "CRM_FUNNEL" -> mapper.funnel(UserContext.getTenantId(), scope, query);
            case "CRM_AGING" -> {
                List<AgingTier> tiers = agingTiers();
                AgingTier overflow = tiers.get(tiers.size() - 1);
                yield mapper.aging(UserContext.getTenantId(), scope, query, tiers, overflow);
            }
            default -> throw ReportValidation.invalid("该服务不提供此数据集");
        };
        return ReportResult.from(dataset, query, rows);
    }

    public List<AgingTier> agingTiers() {
        List<SysDictHelper.DictItem> items = dictionaries.getDictData("crm_receivable_overdue_tier");
        if (items == null || items.isEmpty()) {
            return List.of(new AgingTier(30, "DUE_30", "逾期1—30天"), new AgingTier(60, "DUE_60", "逾期31—60天"),
                    new AgingTier(90, "DUE_90", "逾期61—90天"), new AgingTier(Long.MAX_VALUE, "DUE_90_PLUS", "逾期90天以上"));
        }
        List<SysDictHelper.DictItem> sorted = CrmHealthCalculator.sortedTiers(items);
        List<AgingTier> tiers = new ArrayList<>();
        for (SysDictHelper.DictItem item : sorted) {
            BigDecimal threshold = item.getValueAsDecimal();
            if (threshold == null || threshold.signum() < 0 || threshold.compareTo(BigDecimal.valueOf(Long.MAX_VALUE)) > 0) {
                throw ReportValidation.invalid("源业务账龄档位配置无效");
            }
            String code = CrmHealthCalculator.tierCodeOf(item, sorted);
            tiers.add(new AgingTier(threshold.longValue(), code, item.getLabel() == null ? code : item.getLabel()));
        }
        return List.copyOf(tiers);
    }

    public record AgingTier(long days, String code, String name) { }
}

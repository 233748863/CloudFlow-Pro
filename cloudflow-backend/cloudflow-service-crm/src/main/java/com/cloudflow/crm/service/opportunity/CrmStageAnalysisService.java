package com.cloudflow.crm.service.opportunity;

import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.domain.vo.CrmStageAnalysisRow;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmStageAnalysisMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmStageAnalysisService {
    private final CrmStageAnalysisMapper analysis;
    private final CrmSalesStageService stages;

    public record Stage(String stage, String stageName, boolean terminal, boolean enabled, long currentCount,
            BigDecimal currentAmount, BigDecimal weightedForecast, long incompleteCount, long incompleteSeconds,
            long completedCount, long completedSeconds, BigDecimal averageCompletedSeconds,
            long cohortCount, long convertedCount, BigDecimal conversionRate, long wonCount, long lostCount, long untrackedCount) { }
    public record Report(LocalDate startDate, LocalDate endDate, LocalDateTime asOf, String currency, List<Stage> stages) { }

    @Transactional(readOnly = true)
    public Report report(LocalDate startDate, LocalDate endDate, String currency, Long ownerId) {
        LocalDateTime asOf = LocalDateTime.now().withNano(0);
        LocalDate end = endDate == null ? asOf.toLocalDate() : endDate;
        LocalDate start = startDate == null ? end.minusDays(89) : startDate;
        if (end.isBefore(start) || ChronoUnit.DAYS.between(start, end) > 365 || end.isAfter(asOf.toLocalDate()))
            throw new CrmBusinessException("进入日期范围须为1至366天且不能晚于今天");
        if (currency != null && !"CNY".equals(currency)) throw new CrmBusinessException("商机阶段预测仅支持人民币CNY，不执行隐式汇率换算");
        if (ownerId != null && ownerId <= 0) throw new CrmBusinessException("负责人ID无效");
        Long tenantId = CrmRecordSupport.tenantId();
        Map<String, CrmStageAnalysisRow> totals = new LinkedHashMap<>();
        merge(totals, analysis.current(tenantId, ownerId, asOf, scope()));
        merge(totals, analysis.completed(tenantId, ownerId, start.atStartOfDay(), end.plusDays(1).atStartOfDay(), asOf, scope()));
        merge(totals, analysis.cohorts(tenantId, ownerId, start.atStartOfDay(), end.plusDays(1).atStartOfDay(), asOf, scope()));
        List<Stage> rows = new java.util.ArrayList<>();
        for (CrmSalesStage rule : stages.list()) {
            CrmStageAnalysisRow row = totals.remove(rule.getStageCode());
            rows.add(view(row == null ? empty(rule.getStageCode()) : row, rule.getStageName(), CrmOpportunityStagePolicy.terminal(rule), "ACTIVE".equals(rule.getStatus())));
        }
        totals.values().forEach(row -> rows.add(view(row, row.getStage() + "（缺少阶段配置）", false, false)));
        return new Report(start, end, asOf, "CNY", List.copyOf(rows));
    }

    private Stage view(CrmStageAnalysisRow row, String name, boolean terminal, boolean enabled) {
        BigDecimal average = row.getCompletedCount() == 0 ? null : BigDecimal.valueOf(row.getCompletedSeconds()).divide(BigDecimal.valueOf(row.getCompletedCount()), 2, RoundingMode.HALF_UP);
        BigDecimal rate = terminal || row.getCohortCount() == 0 ? null : BigDecimal.valueOf(row.getConvertedCount()).movePointRight(2).divide(BigDecimal.valueOf(row.getCohortCount()), 2, RoundingMode.HALF_UP);
        return new Stage(row.getStage(), name, terminal, enabled, row.getCurrentCount(), amount(row.getCurrentAmount()), amount(row.getWeightedForecast()),
                row.getIncompleteCount(), row.getIncompleteSeconds(), row.getCompletedCount(), row.getCompletedSeconds(), average,
                row.getCohortCount(), row.getConvertedCount(), rate, row.getWonCount(), row.getLostCount(), row.getUntrackedCount());
    }

    private void merge(Map<String, CrmStageAnalysisRow> totals, List<CrmStageAnalysisRow> rows) {
        for (CrmStageAnalysisRow row : rows) {
            CrmStageAnalysisRow total = totals.computeIfAbsent(row.getStage(), this::empty);
            total.setCurrentCount(Math.addExact(total.getCurrentCount(), row.getCurrentCount()));
            total.setCurrentAmount(amount(total.getCurrentAmount()).add(amount(row.getCurrentAmount())));
            total.setWeightedForecast(amount(total.getWeightedForecast()).add(amount(row.getWeightedForecast())));
            total.setIncompleteCount(Math.addExact(total.getIncompleteCount(), row.getIncompleteCount()));
            total.setIncompleteSeconds(Math.addExact(total.getIncompleteSeconds(), row.getIncompleteSeconds()));
            total.setCompletedCount(Math.addExact(total.getCompletedCount(), row.getCompletedCount()));
            total.setCompletedSeconds(Math.addExact(total.getCompletedSeconds(), row.getCompletedSeconds()));
            total.setCohortCount(Math.addExact(total.getCohortCount(), row.getCohortCount()));
            total.setConvertedCount(Math.addExact(total.getConvertedCount(), row.getConvertedCount()));
            total.setWonCount(Math.addExact(total.getWonCount(), row.getWonCount())); total.setLostCount(Math.addExact(total.getLostCount(), row.getLostCount()));
            total.setUntrackedCount(Math.addExact(total.getUntrackedCount(), row.getUntrackedCount()));
        }
    }

    private DataScope scope() { return DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"); }
    private BigDecimal amount(BigDecimal value) { return value == null ? new BigDecimal("0.00") : value; }
    private CrmStageAnalysisRow empty(String stage) { CrmStageAnalysisRow row = new CrmStageAnalysisRow(); row.setStage(stage); return row; }
}

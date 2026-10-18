package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.domain.vo.CrmPerformanceAggregateRow;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmPerformanceAggregateMapper;
import com.cloudflow.crm.service.ICrmPerformanceQueryService;
import com.cloudflow.crm.service.deal.CrmDealPolicy;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CrmPerformanceQueryServiceImpl implements ICrmPerformanceQueryService {
    private final CrmPerformanceAggregateMapper amounts;
    private final CrmReceiptAchievementService receiptScopes;

    @Override
    public List<CrmPerformanceSummaryVO> summarizeByOwner(List<Long> ownerIds, String startDate, String endDate,
            String calculationBasis, String currency) {
        return aggregate("OWNER", ownerIds, startDate, endDate, calculationBasis, currency, null);
    }

    @Override
    public List<CrmPerformanceSummaryVO> summarizeByDept(List<Long> deptIds, String startDate, String endDate,
            String calculationBasis, String currency) {
        return aggregate("DEPT", deptIds, startDate, endDate, calculationBasis, currency, null);
    }

    @Override
    public List<CrmPerformanceSummaryVO> topOwners(int limit, String startDate, String endDate,
            String calculationBasis, String currency) {
        return aggregate("OWNER", null, startDate, endDate, calculationBasis, currency, rankLimit(limit));
    }

    @Override
    public List<CrmPerformanceSummaryVO> topDepartments(int limit, String startDate, String endDate,
            String calculationBasis, String currency) {
        return aggregate("DEPT", null, startDate, endDate, calculationBasis, currency, rankLimit(limit));
    }

    private List<CrmPerformanceSummaryVO> aggregate(String dimension, List<Long> ids, String startDate, String endDate,
            String calculationBasis, String currency, Integer limit) {
        CrmReceiptAchievementService.Scope scope = receiptScopes.scope();
        String selectedBasis = CrmReceiptAchievementService.basis(calculationBasis == null ? "OWNER_V1" : calculationBasis);
        String selectedCurrency = CrmDealPolicy.currency(currency == null ? "CNY" : currency);
        if (ids != null && (ids.size() > 200 || ids.stream().anyMatch(identifier -> identifier == null || identifier <= 0))) {
            throw invalid("一次销售业绩查询最多指定200个有效对象");
        }
        List<Long> selectedIds = ids == null ? List.of() : ids.stream().distinct().toList();
        LocalDate start = date(startDate);
        LocalDate end = date(endDate);
        if (start != null && end != null && start.isAfter(end)) throw invalid("销售业绩起始日期不能晚于结束日期");
        LocalDateTime from = start == null ? null : start.atStartOfDay();
        LocalDateTime until = end == null ? null : end.atTime(LocalTime.of(23, 59, 59));
        List<CrmPerformanceAggregateRow> rows = amounts.aggregate(dimension, selectedIds, from, until, selectedBasis, selectedCurrency, limit, scope);
        List<CrmPerformanceSummaryVO> result = new ArrayList<>();
        for (CrmPerformanceAggregateRow row : rows) {
            if (row.getTargetId() == null || row.getTargetId() <= 0 || !selectedIds.isEmpty() && !selectedIds.contains(row.getTargetId())) {
                throw invalid("销售业绩返回了范围外对象");
            }
            if (row.getInvalidAllocationCount() == null || row.getInvalidAllocationCount() != 0) {
                throw invalid("当前未收金额无法按团队精确分配，请核对未收余额和团队比例");
            }
            CrmPerformanceSummaryVO value = new CrmPerformanceSummaryVO();
            BeanUtils.copyProperties(row, value);
            value.setDimension(dimension);
            value.setCalculationBasis(selectedBasis);
            value.setCurrency(selectedCurrency);
            value.setWonAmount(money(row.getWonAmount()));
            value.setContractAmount(money(row.getContractAmount()));
            value.setReceivedAmount(money(row.getReceivedAmount()));
            value.setOutstandingAmount(money(row.getOutstandingAmount()));
            value.setBaselineWonAmount(money(row.getBaselineWonAmount()));
            value.setBaselineContractAmount(money(row.getBaselineContractAmount()));
            value.setBaselineReceivedAmount(money(row.getBaselineReceivedAmount()));
            value.setAllocatedWonCount((row.getAllocatedWonCount() == null ? BigDecimal.ZERO : row.getAllocatedWonCount()).setScale(4, RoundingMode.UNNECESSARY));
            result.add(value);
        }
        return List.copyOf(result);
    }

    private static int rankLimit(int limit) {
        if (limit < 1 || limit > 200) throw invalid("销售业绩排行数量须在1至200之间");
        return limit;
    }

    private static LocalDate date(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new DateTimeParseException("Invalid date", value, 0);
            LocalDate date = LocalDate.parse(value);
            if (date.getYear() < 1000 || date.getYear() > 9999) throw new DateTimeParseException("Invalid year", value, 0);
            return date;
        } catch (DateTimeParseException invalidDate) {
            throw invalid("销售业绩日期须为1000至9999年内的有效日期");
        }
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.UNNECESSARY);
    }

    private static CrmBusinessException invalid(String message) {
        return new CrmBusinessException(message);
    }
}

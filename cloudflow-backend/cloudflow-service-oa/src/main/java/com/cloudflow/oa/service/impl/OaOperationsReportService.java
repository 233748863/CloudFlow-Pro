package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.dto.OaReportQuery;
import com.cloudflow.oa.mapper.OaOperationsReportMapper;
import com.cloudflow.oa.mapper.OaPurchaseRfqMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class OaOperationsReportService {
    private final OaOperationsReportMapper reports;
    private final OaPurchaseRfqMapper rfqs;
    private final OaRfqAccessService access;

    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> assets(LocalDate from, LocalDate to) {
        OaReportQuery query = period(from, to);
        return Map.of("summary", reports.assetTotals(query), "distribution", reports.assetDistribution(query), "depreciation", reports.assetDepreciation(query), "repairs", reports.assetRepairs(query));
    }

    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> suppliers(LocalDate from, LocalDate to) {
        OaReportQuery query = period(from, to == null ? LocalDate.now().plusDays(30) : to);
        return Map.of("standing", reports.supplierStanding(query), "scores", reports.supplierScores(query), "expiry", reports.supplierExpiry(query), "purchases", reports.supplierPurchases(query));
    }

    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> projects(LocalDate from, LocalDate to) {
        OaReportQuery query = period(from, to);
        return Map.of("costs", reports.projectCosts(query), "labor", reports.projectLabor(query), "filing", reports.projectFiling(query), "gantt", reports.projectGantt(query));
    }

    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> projectEffort(LocalDate from, LocalDate to) {
        OaReportQuery query = period(from, to);
        return Map.of("labor", reports.projectLabor(query), "filing", reports.projectFiling(query), "gantt", reports.projectGantt(query));
    }

    @Transactional(readOnly = true)
    public Map<String, List<Map<String, Object>>> contracts(LocalDate from, LocalDate to) {
        OaReportQuery query = scope();
        return Map.of("dashboard", reports.contractDashboard(query), "overdue", reports.contractOverdue(query), "byType", reports.contractRates(query, "TYPE"), "byOwner", reports.contractRates(query, "OWNER"), "byCounterparty", reports.contractRates(query, "COUNTERPARTY"));
    }

    @Transactional(readOnly = true)
    @Audit(name = "查看询价合规经营报表")
    public Map<String, List<Map<String, Object>>> rfqs(LocalDate from, LocalDate to) {
        OaReportQuery query = period(from, to);
        query.setRfqIds(rfqs.selectList(new LambdaQueryWrapper<OaPurchaseRfq>().eq(OaPurchaseRfq::getTenantId, query.getTenantId()).eq(OaPurchaseRfq::getDeleted, 0)
                .ge(OaPurchaseRfq::getCreateTime, query.getFromDate().atStartOfDay()).lt(OaPurchaseRfq::getCreateTime, query.getToDate().plusDays(1).atStartOfDay()))
                .stream().filter(access::canCompare).map(OaPurchaseRfq::getRfqId).toList());
        return Map.of("summary", reports.rfqStatistics(query), "savings", reports.rfqSavings(query), "responses", reports.rfqResponses(query), "nonLowest", reports.rfqNonLowest(query));
    }

    private OaReportQuery period(LocalDate from, LocalDate to) {
        LocalDate start = from == null ? LocalDate.now().minusDays(30) : from;
        LocalDate end = to == null ? LocalDate.now() : to;
        if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) > 365) throw new ServiceException("查询期间必须为1至366天", 400);
        OaReportQuery query = scope(); query.setFromDate(start); query.setToDate(end); return query;
    }

    private OaReportQuery scope() {
        OaReportQuery query = new OaReportQuery();
        query.setTenantId(OaRecordSupport.tenantId());
        query.setUserId(OaRecordSupport.require(UserContext.getUserId(), "报表用户未登录"));
        return query;
    }
}

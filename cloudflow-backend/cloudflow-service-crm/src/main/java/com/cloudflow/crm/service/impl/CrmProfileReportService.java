package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmTerritory;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmLeadMapper;
import com.cloudflow.crm.mapper.CrmTerritoryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CrmProfileReportService {
    private final CrmLeadMapper leads;
    private final CrmCustomerMapper customers;
    private final CrmTerritoryMapper territories;

    public Map<String, Object> report(String dimension) {
        if (!Set.of("territory", "segment", "industry", "score").contains(dimension)) throw new CrmBusinessException("分层统计维度无效");
        List<CrmLead> leadRows = leads.selectAllByDataScope(DataScopeUtils.listScope("dept_id", "owner_id"));
        List<CrmCustomer> customerRows = customers.selectAllByDataScope(DataScopeUtils.listScope("dept_id", "owner_id"));
        Map<Long, String> names = territories.selectList(new LambdaQueryWrapper<CrmTerritory>().eq(CrmTerritory::getDeleted, 0))
                .stream().collect(Collectors.toMap(CrmTerritory::getTerritoryId, CrmTerritory::getTerritoryName));
        Map<String, Long> funnel = new LinkedHashMap<>();
        for (String stage : List.of("UNQUALIFIED", "QUALIFYING", "QUALIFIED", "DISQUALIFIED", "CONVERTED")) funnel.put(stage, 0L);
        for (CrmLead lead : leadRows) funnel.merge(lead.getConvertedCustomerId() == null ? lead.getQualificationStatus() : "CONVERTED", 1L, Long::sum);
        Function<CrmLead, String> leadKey = lead -> label(switch (dimension) {
            case "territory" -> names.get(lead.getTerritoryId()); case "segment" -> lead.getMarketSegment();
            case "industry" -> lead.getIndustry(); default -> scoreBucket(lead.getLeadScore());
        });
        Function<CrmCustomer, String> customerKey = customer -> label(switch (dimension) {
            case "territory" -> names.get(customer.getTerritoryId()); case "segment" -> customer.getMarketSegment();
            case "industry" -> customer.getIndustry(); default -> "不适用";
        });
        Map<String, Long> leadCounts = leadRows.stream().collect(Collectors.groupingBy(leadKey, LinkedHashMap::new, Collectors.counting()));
        Map<String, Long> customerCounts = "score".equals(dimension) ? Map.of() : customerRows.stream().collect(Collectors.groupingBy(customerKey, LinkedHashMap::new, Collectors.counting()));
        Set<String> keys = new java.util.TreeSet<>(leadCounts.keySet()); keys.addAll(customerCounts.keySet());
        return Map.of("funnel", funnel, "distribution", keys.stream().map(key -> Map.of("name", key,
                "leads", leadCounts.getOrDefault(key, 0L), "customers", customerCounts.getOrDefault(key, 0L))).toList());
    }
    private String label(String value) { return value == null || value.isBlank() ? "未设置" : value; }
    private String scoreBucket(Integer score) { return score == null || score <= 0 ? "0及以下" : score <= 30 ? "1-30" : score <= 60 ? "31-60" : score <= 100 ? "61-100" : "100以上"; }
}

package com.cloudflow.hr.service.impl;

import com.cloudflow.hr.service.HrRecruitmentChannelService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class HrRecruitmentChannelServiceImpl implements HrRecruitmentChannelService {

    private static final long TENANT_ID = 100000L;

    private final JdbcTemplate jdbcTemplate;

    @Override
    public List<Map<String, Object>> channelStats() {
        List<Map<String, Object>> channels = jdbcTemplate.queryForList(
                "SELECT id, channel_code, channel_name, channel_type, cost_amount, cost_currency, status, contract_start, contract_end "
                        + "FROM hr_recruitment_channel WHERE tenant_id=? AND deleted=0 ORDER BY id DESC",
                TENANT_ID);
        if (channels.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> stats = jdbcTemplate.queryForList(
                "SELECT channel_id, COUNT(*) AS total, SUM(CASE WHEN status='HIRED' THEN 1 ELSE 0 END) AS hired "
                        + "FROM hr_candidate WHERE tenant_id=? AND deleted=0 AND channel_id IS NOT NULL GROUP BY channel_id",
                TENANT_ID);
        Map<Long, Map<String, Object>> statByChannel = new LinkedHashMap<>();
        for (Map<String, Object> s : stats) {
            Long channelId = ((Number) s.get("channel_id")).longValue();
            statByChannel.put(channelId, s);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> ch : channels) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", ch.get("id"));
            row.put("channelCode", ch.get("channel_code"));
            row.put("channelName", ch.get("channel_name"));
            row.put("channelType", ch.get("channel_type"));
            row.put("status", ch.get("status"));
            row.put("contractStart", ch.get("contract_start"));
            row.put("contractEnd", ch.get("contract_end"));
            BigDecimal cost = ch.get("cost_amount") == null
                    ? BigDecimal.ZERO : new BigDecimal(String.valueOf(ch.get("cost_amount")));
            row.put("costAmount", cost);
            row.put("costCurrency", ch.get("cost_currency"));

            Map<String, Object> s = statByChannel.get(((Number) ch.get("id")).longValue());
            long total = s == null ? 0 : ((Number) s.get("total")).longValue();
            long hired = s == null || s.get("hired") == null ? 0 : ((Number) s.get("hired")).longValue();
            row.put("totalCandidates", total);
            row.put("hiredCount", hired);
            BigDecimal hireRate = total > 0
                    ? BigDecimal.valueOf(hired).multiply(BigDecimal.valueOf(100))
                            .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            row.put("hireRate", hireRate);
            BigDecimal costPerHire = hired > 0
                    ? cost.divide(BigDecimal.valueOf(hired), 2, RoundingMode.HALF_UP)
                    : cost;
            row.put("costPerHire", costPerHire);
            result.add(row);
        }
        return result;
    }
}

package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrRecruitmentChannel;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrRecruitmentChannelMapper;
import com.cloudflow.hr.service.HrRecruitmentChannelService;
import lombok.RequiredArgsConstructor;
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

    private final HrRecruitmentChannelMapper channelMapper;
    private final HrCandidateMapper candidateMapper;

    @Override
    public List<Map<String, Object>> channelStats() {
        List<HrRecruitmentChannel> channels = channelMapper.selectList(
                new LambdaQueryWrapper<HrRecruitmentChannel>()
                        .eq(HrRecruitmentChannel::getTenantId, TENANT_ID)
                        .eq(HrRecruitmentChannel::getDeleted, 0)
                        .orderByDesc(HrRecruitmentChannel::getId));
        if (channels.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> stats = candidateMapper.selectChannelHireStats(TENANT_ID);
        Map<Long, Map<String, Object>> statByChannel = new LinkedHashMap<>();
        for (Map<String, Object> s : stats) {
            Long channelId = ((Number) s.get("channel_id")).longValue();
            statByChannel.put(channelId, s);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (HrRecruitmentChannel ch : channels) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", ch.getId());
            row.put("channelCode", ch.getChannelCode());
            row.put("channelName", ch.getChannelName());
            row.put("channelType", ch.getChannelType());
            row.put("status", ch.getStatus());
            row.put("contractStart", ch.getContractStart());
            row.put("contractEnd", ch.getContractEnd());
            BigDecimal cost = ch.getCostAmount() == null ? BigDecimal.ZERO : ch.getCostAmount();
            row.put("costAmount", cost);
            row.put("costCurrency", ch.getCostCurrency());

            Map<String, Object> s = statByChannel.get(ch.getId());
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

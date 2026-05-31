package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.entity.HrRecruitmentChannel;
import com.cloudflow.hr.domain.vo.recruitment.HrChannelStatVO;
import com.cloudflow.hr.mapper.HrCandidateMapper;
import com.cloudflow.hr.mapper.HrRecruitmentChannelMapper;
import com.cloudflow.hr.service.IHrRecruitmentChannelService;
import com.cloudflow.common.audit.annotation.Audit;
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
public class HrRecruitmentChannelServiceImpl implements IHrRecruitmentChannelService {

    private static final long TENANT_ID = 100000L;

    private final HrRecruitmentChannelMapper channelMapper;
    private final HrCandidateMapper candidateMapper;

    @Override
    public List<HrChannelStatVO> channelStats() {
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

        List<HrChannelStatVO> result = new ArrayList<>(channels.size());
        for (HrRecruitmentChannel ch : channels) {
            HrChannelStatVO vo = new HrChannelStatVO();
            vo.setId(ch.getId());
            vo.setChannelCode(ch.getChannelCode());
            vo.setChannelName(ch.getChannelName());
            vo.setChannelType(ch.getChannelType());
            vo.setStatus(ch.getStatus());
            vo.setContractStart(ch.getContractStart());
            vo.setContractEnd(ch.getContractEnd());
            BigDecimal cost = ch.getCostAmount() == null ? BigDecimal.ZERO : ch.getCostAmount();
            vo.setCostAmount(cost);
            vo.setCostCurrency(ch.getCostCurrency());

            Map<String, Object> s = statByChannel.get(ch.getId());
            long total = s == null ? 0 : ((Number) s.get("total")).longValue();
            long hired = s == null || s.get("hired") == null ? 0 : ((Number) s.get("hired")).longValue();
            vo.setTotalCandidates(total);
            vo.setHiredCount(hired);
            BigDecimal hireRate = total > 0
                    ? BigDecimal.valueOf(hired).multiply(BigDecimal.valueOf(100))
                            .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            vo.setHireRate(hireRate);
            BigDecimal costPerHire = hired > 0
                    ? cost.divide(BigDecimal.valueOf(hired), 2, RoundingMode.HALF_UP)
                    : cost;
            vo.setCostPerHire(costPerHire);
            result.add(vo);
        }
        return result;
    }
}

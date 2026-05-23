package com.cloudflow.hr.service;

import java.util.List;
import java.util.Map;

/**
 * HR-P0-3 招聘渠道服务。
 */
public interface HrRecruitmentChannelService {

    /**
     * 渠道有效性统计：返回每个渠道的候选人量 / 入职率 / 单位招聘成本。
     * - 候选人量 = hr_candidate.channel_id 关联数
     * - 入职数 = candidate.status='HIRED' 的数量
     * - 入职率 = 入职数 / 候选人量
     * - 单位招聘成本 = cost_amount / 入职数（入职数=0 时为 cost_amount）
     */
    List<Map<String, Object>> channelStats();
}

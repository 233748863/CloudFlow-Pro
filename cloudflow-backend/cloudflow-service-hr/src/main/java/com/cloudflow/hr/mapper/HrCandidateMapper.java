package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrCandidate;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface HrCandidateMapper extends BaseMapper<HrCandidate> {

    /**
     * 按招聘渠道聚合候选人总数与已录用数，供渠道统计页计算入职率/单位成本。
     * 返回字段：channel_id / total / hired。
     */
    List<Map<String, Object>> selectChannelHireStats(@Param("tenantId") Long tenantId);
}

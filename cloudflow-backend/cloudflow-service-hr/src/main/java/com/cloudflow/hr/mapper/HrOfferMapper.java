package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrOffer;

public interface HrOfferMapper extends BaseMapper<HrOffer> {
    HrOffer lockOffer(@org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
            @org.apache.ibatis.annotations.Param("offerId") Long offerId);
    int decisionMatches(@org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
            @org.apache.ibatis.annotations.Param("offerId") Long offerId,
            @org.apache.ibatis.annotations.Param("instanceId") String instanceId,
            @org.apache.ibatis.annotations.Param("status") String status,
            @org.apache.ibatis.annotations.Param("actor") Long actor);
}

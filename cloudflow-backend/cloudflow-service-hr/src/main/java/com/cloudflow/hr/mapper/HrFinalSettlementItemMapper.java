package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import org.apache.ibatis.annotations.Param;

public interface HrFinalSettlementItemMapper extends BaseMapper<HrFinalSettlementItem> {
    Long lock(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
}

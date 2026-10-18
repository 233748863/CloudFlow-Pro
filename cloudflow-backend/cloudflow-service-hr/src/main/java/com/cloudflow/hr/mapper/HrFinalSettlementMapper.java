package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import org.apache.ibatis.annotations.Param;

public interface HrFinalSettlementMapper extends BaseMapper<HrFinalSettlement> {
    Long lock(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    int updateDraft(@Param("record") HrFinalSettlement record, @Param("expectedVersion") Integer expectedVersion);
    int updateApproval(@Param("record") HrFinalSettlement record, @Param("expectedVersion") Integer expectedVersion);
    int confirm(@Param("record") HrFinalSettlement record, @Param("expectedVersion") Integer expectedVersion);
}

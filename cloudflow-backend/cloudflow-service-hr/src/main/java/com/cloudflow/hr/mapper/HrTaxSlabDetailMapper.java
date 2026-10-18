package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrTaxSlabDetail;
import org.apache.ibatis.annotations.Param;

public interface HrTaxSlabDetailMapper extends BaseMapper<HrTaxSlabDetail> {
    int deleteForReplacement(@Param("tenantId") Long tenantId, @Param("slabId") Long slabId);
}

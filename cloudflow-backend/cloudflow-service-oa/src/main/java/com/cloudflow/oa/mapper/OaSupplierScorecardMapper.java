package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierScorecard;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaSupplierScorecardMapper extends BaseMapper<OaSupplierScorecard> {
    OaSupplierScorecard selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

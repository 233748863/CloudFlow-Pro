package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaActivityCost;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaActivityCostMapper extends BaseMapper<OaActivityCost> {
    OaActivityCost selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaActivityType;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaActivityTypeMapper extends BaseMapper<OaActivityType> {
    OaActivityType selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

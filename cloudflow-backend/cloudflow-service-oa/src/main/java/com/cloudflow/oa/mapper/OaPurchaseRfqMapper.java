package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaPurchaseRfq;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaPurchaseRfqMapper extends BaseMapper<OaPurchaseRfq> {
    OaPurchaseRfq selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

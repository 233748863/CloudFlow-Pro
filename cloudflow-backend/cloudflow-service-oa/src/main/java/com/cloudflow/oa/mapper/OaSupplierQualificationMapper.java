package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierQualification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaSupplierQualificationMapper extends BaseMapper<OaSupplierQualification> {
    OaSupplierQualification selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysFileConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysFileConfigMapper extends BaseMapper<SysFileConfig> {
    long countCode(@Param("tenantId") Long tenantId, @Param("configCode") String configCode, @Param("configId") Long configId);
    Long lockTenant(@Param("tenantId") Long tenantId);
    int clearMaster(@Param("tenantId") Long tenantId, @Param("configId") Long configId);
}

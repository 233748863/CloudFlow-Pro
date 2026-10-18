package com.cloudflow.common.tenant.session.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LoginSessionMapper {
    // This cross-tenant identity query enforces both tenant IDs in XML and already runs
    // without automatic tenant conditions. Avoid parsing it merely to skip every table.
    @InterceptorIgnore(tenantLine = "true")
    int active(@Param("ownerTenantId") long ownerTenantId, @Param("tenantId") long tenantId,
            @Param("userId") long userId, @Param("userVersion") int userVersion);
}

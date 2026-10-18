package com.cloudflow.common.tenant.entitlement.mapper;

import com.cloudflow.common.tenant.entitlement.TenantEntitlementMenu;
import com.cloudflow.common.tenant.entitlement.TenantEntitlementRow;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TenantEntitlementMapper {
    TenantEntitlementRow current(@Param("tenantId") long tenantId);
    List<TenantEntitlementMenu> menus(@Param("menuIds") Collection<Long> menuIds);
}

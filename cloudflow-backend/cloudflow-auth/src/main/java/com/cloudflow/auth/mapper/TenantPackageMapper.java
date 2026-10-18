package com.cloudflow.auth.mapper;

import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysTenantPackage;
import com.cloudflow.auth.domain.SysTenantPackageSync;
import com.cloudflow.auth.domain.SysTenantPackageSyncItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TenantPackageMapper {
    List<SysMenu> catalog();
    List<SysTenantPackage> page(@Param("platformId") long platformId, @Param("offset") long offset, @Param("limit") int limit);
    long count(@Param("platformId") long platformId);
    SysTenantPackage findPackage(@Param("platformId") long platformId, @Param("packageId") long packageId);
    SysTenantPackage lockPackage(@Param("platformId") long platformId, @Param("packageId") long packageId);
    int insertPackage(SysTenantPackage entity);
    int updatePackage(SysTenantPackage entity);
    SysTenant tenant(@Param("tenantId") long tenantId);
    SysTenant lockTenant(@Param("tenantId") long tenantId);
    long tenantNameCount(@Param("tenantName") String tenantName, @Param("excludeTenantId") Long excludeTenantId);
    int insertTenant(SysTenant entity);
    int updateTenant(SysTenant entity);
    int applyTenant(@Param("entity") SysTenant entity, @Param("expectedVersion") int expectedVersion, @Param("expectedPackageId") long expectedPackageId);
    int insertSync(SysTenantPackageSync entity);
    int insertItem(SysTenantPackageSyncItem entity);
    SysTenantPackageSync findSync(@Param("platformId") long platformId, @Param("syncId") long syncId);
    SysTenantPackageSync lockSync(@Param("platformId") long platformId, @Param("syncId") long syncId);
    List<SysTenantPackageSyncItem> items(@Param("platformId") long platformId, @Param("syncId") long syncId);
    SysTenantPackageSyncItem lockItem(@Param("platformId") long platformId, @Param("syncId") long syncId, @Param("itemId") long itemId);
    int updateSync(SysTenantPackageSync entity);
    int updateItem(SysTenantPackageSyncItem entity);
}

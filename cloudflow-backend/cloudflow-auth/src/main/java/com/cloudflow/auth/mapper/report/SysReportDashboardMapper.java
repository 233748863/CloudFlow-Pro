package com.cloudflow.auth.mapper.report;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.report.SysReportDashboard;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysReportDashboardMapper extends BaseMapper<SysReportDashboard> {
    Page<SysReportDashboard> visible(Page<SysReportDashboard> page, @Param("tenantId") Long tenantId,
                                    @Param("viewerId") Long viewerId, @Param("departmentId") Long departmentId);
    SysReportDashboard visibleById(@Param("tenantId") Long tenantId, @Param("id") Long id,
                                   @Param("viewerId") Long viewerId, @Param("departmentId") Long departmentId);
    SysReportDashboard lockById(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int writeDefinition(@Param("record") SysReportDashboard record, @Param("expectedVersion") int expectedVersion);
    int writeSharing(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("ownerId") Long ownerId,
                     @Param("scope") String scope, @Param("version") int version, @Param("actor") String actor);
    int removeDefinition(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("ownerId") Long ownerId,
                         @Param("version") int version, @Param("actor") String actor);
}

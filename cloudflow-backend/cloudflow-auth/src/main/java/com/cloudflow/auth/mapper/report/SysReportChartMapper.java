package com.cloudflow.auth.mapper.report;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.report.SysReportChart;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysReportChartMapper extends BaseMapper<SysReportChart> {
    Page<SysReportChart> visible(Page<SysReportChart> page, @Param("tenantId") Long tenantId,
                                @Param("viewerId") Long viewerId, @Param("departmentId") Long departmentId);
    SysReportChart visibleById(@Param("tenantId") Long tenantId, @Param("id") Long id,
                               @Param("viewerId") Long viewerId, @Param("departmentId") Long departmentId);
    SysReportChart lockById(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int writeDefinition(@Param("record") SysReportChart record, @Param("expectedVersion") int expectedVersion);
    int writeSharing(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("ownerId") Long ownerId,
                     @Param("scope") String scope, @Param("version") int version, @Param("actor") String actor);
    int removeDefinition(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("ownerId") Long ownerId,
                         @Param("version") int version, @Param("actor") String actor);
    long referenceCount(@Param("tenantId") Long tenantId, @Param("id") Long id);
}

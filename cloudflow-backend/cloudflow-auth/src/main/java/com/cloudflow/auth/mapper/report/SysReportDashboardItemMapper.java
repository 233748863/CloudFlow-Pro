package com.cloudflow.auth.mapper.report;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.report.SysReportDashboardItem;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysReportDashboardItemMapper extends BaseMapper<SysReportDashboardItem> {
    List<SysReportDashboardItem> forDashboard(@Param("tenantId") Long tenantId, @Param("dashboardId") Long dashboardId);
    int clearLayout(@Param("tenantId") Long tenantId, @Param("dashboardId") Long dashboardId);
}

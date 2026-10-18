package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.vo.OaTimesheetDayTotal;
import com.cloudflow.oa.domain.vo.OaProjectFinancialTotals;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface OaTimesheetQueryMapper {
    List<OaTimesheetDayTotal> dailyHours(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId, @Param("excludeId") Long excludeId, @Param("from") LocalDate from, @Param("to") LocalDate to);
    com.cloudflow.oa.domain.vo.OaTimesheetReversalTotals reversalTotals(@Param("tenantId") Long tenantId, @Param("detailId") Long detailId, @Param("excludeId") Long excludeId);
    List<Long> reviewableSheetIds(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<OaProject> availableProjects(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<OaProject> availableProjectsForPeriod(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                              @Param("fromDate") LocalDate fromDate, @Param("toDate") LocalDate toDate);
    OaProjectFinancialTotals totals(@Param("tenantId") Long tenantId, @Param("projectId") Long projectId);
    BigDecimal taskHours(@Param("tenantId") Long tenantId, @Param("taskId") Long taskId);
}

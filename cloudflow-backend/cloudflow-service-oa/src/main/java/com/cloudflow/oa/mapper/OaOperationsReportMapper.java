package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.dto.OaReportQuery;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface OaOperationsReportMapper {
    List<Map<String, Object>> assetTotals(@Param("query") OaReportQuery query);
    List<Map<String, Object>> assetDistribution(@Param("query") OaReportQuery query);
    List<Map<String, Object>> assetDepreciation(@Param("query") OaReportQuery query);
    List<Map<String, Object>> assetRepairs(@Param("query") OaReportQuery query);
    List<Map<String, Object>> supplierStanding(@Param("query") OaReportQuery query);
    List<Map<String, Object>> supplierScores(@Param("query") OaReportQuery query);
    List<Map<String, Object>> supplierExpiry(@Param("query") OaReportQuery query);
    List<Map<String, Object>> supplierPurchases(@Param("query") OaReportQuery query);
    List<Map<String, Object>> projectCosts(@Param("query") OaReportQuery query);
    List<Map<String, Object>> projectLabor(@Param("query") OaReportQuery query);
    List<Map<String, Object>> projectFiling(@Param("query") OaReportQuery query);
    List<Map<String, Object>> projectGantt(@Param("query") OaReportQuery query);
    List<Map<String, Object>> contractDashboard(@Param("query") OaReportQuery query);
    List<Map<String, Object>> contractOverdue(@Param("query") OaReportQuery query);
    List<Map<String, Object>> rfqStatistics(@Param("query") OaReportQuery query);
    List<Map<String, Object>> rfqSavings(@Param("query") OaReportQuery query);
    List<Map<String, Object>> rfqResponses(@Param("query") OaReportQuery query);
    List<Map<String, Object>> rfqNonLowest(@Param("query") OaReportQuery query);
    List<Map<String, Object>> contractRates(@Param("query") OaReportQuery query, @Param("dimension") String dimension);
}

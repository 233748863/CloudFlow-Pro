package com.cloudflow.crm.mapper;

import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.report.ReportDataScope;
import com.cloudflow.crm.service.impl.CrmReportService.AgingTier;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmReportMapper {
    List<ReportRow> funnel(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                           @Param("query") PreparedReportQuery query);
    List<ReportRow> aging(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                          @Param("query") PreparedReportQuery query, @Param("tiers") List<AgingTier> tiers,
                          @Param("overflow") AgingTier overflow);
}

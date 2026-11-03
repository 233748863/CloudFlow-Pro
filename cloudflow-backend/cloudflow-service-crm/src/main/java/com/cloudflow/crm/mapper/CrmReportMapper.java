package com.cloudflow.crm.mapper;

import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.report.ReportDataScope;
import com.cloudflow.crm.service.impl.CrmReceivableAging.Tier;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmReportMapper {
    List<ReportRow> funnel(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                           @Param("query") PreparedReportQuery query);
    List<ReportRow> aging(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                          @Param("query") PreparedReportQuery query, @Param("tiers") List<Tier> tiers,
                          @Param("overflow") Tier overflow);
}

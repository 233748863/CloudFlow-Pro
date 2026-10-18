package com.cloudflow.oa.mapper;

import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.report.ReportDataScope;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaReportMapper {
    List<ReportRow> expense(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                           @Param("query") PreparedReportQuery query);
    List<ReportRow> budget(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                           @Param("query") PreparedReportQuery query);
    List<ReportRow> assets(@Param("tenantId") Long tenantId, @Param("query") PreparedReportQuery query);
}

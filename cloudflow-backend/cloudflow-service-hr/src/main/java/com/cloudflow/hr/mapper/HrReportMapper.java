package com.cloudflow.hr.mapper;

import com.cloudflow.common.core.report.PreparedReportQuery;
import com.cloudflow.common.core.report.ReportRow;
import com.cloudflow.common.report.ReportDataScope;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HrReportMapper {
    List<ReportRow> attendance(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                               @Param("query") PreparedReportQuery query);
    List<ReportRow> leave(@Param("tenantId") Long tenantId, @Param("scope") ReportDataScope scope,
                          @Param("query") PreparedReportQuery query);
}

package com.cloudflow.crm.mapper;

import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.vo.CrmStageAnalysisRow;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmStageAnalysisMapper {
    List<CrmStageAnalysisRow> current(@Param("tenantId") Long tenantId, @Param("ownerId") Long ownerId,
            @Param("asOf") LocalDateTime asOf, @Param("dataScope") DataScope dataScope);
    List<CrmStageAnalysisRow> completed(@Param("tenantId") Long tenantId, @Param("ownerId") Long ownerId,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("asOf") LocalDateTime asOf, @Param("dataScope") DataScope dataScope);
    List<CrmStageAnalysisRow> cohorts(@Param("tenantId") Long tenantId, @Param("ownerId") Long ownerId,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("asOf") LocalDateTime asOf, @Param("dataScope") DataScope dataScope);
}

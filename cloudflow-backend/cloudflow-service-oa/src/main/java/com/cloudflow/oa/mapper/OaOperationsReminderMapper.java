package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface OaOperationsReminderMapper {
    List<SysSupplier> unscoredSuppliers(@Param("tenantId") Long tenantId, @Param("from") LocalDate from, @Param("to") LocalDate to);
    List<OaIdentityReference> missingTimesheets(@Param("tenantId") Long tenantId, @Param("from") LocalDate from, @Param("to") LocalDate to);
}

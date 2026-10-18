package com.cloudflow.auth.mapper;

import com.cloudflow.auth.importing.HolidayImport;
import com.cloudflow.common.holiday.domain.HolidayDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HolidayImportMapper {
    List<HolidayDate> existing(@Param("tenantId") long tenantId, @Param("rows") List<HolidayImport.Row> rows);
}

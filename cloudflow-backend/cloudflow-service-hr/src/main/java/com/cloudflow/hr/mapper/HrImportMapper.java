package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.cloudflow.common.excel.importing.ImportReference;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HrImportMapper {
    List<ImportReference> departments(@Param("tenantId") long tenantId);
    List<ImportReference> posts(@Param("tenantId") long tenantId);
    List<ImportReference> positions(@Param("tenantId") long tenantId);
    @InterceptorIgnore(tenantLine = "true")
    List<ImportReference> dictionary(@Param("tenantId") long tenantId, @Param("type") String type);
    List<String> existingEmployees(@Param("tenantId") long tenantId, @Param("codes") List<String> codes);
}

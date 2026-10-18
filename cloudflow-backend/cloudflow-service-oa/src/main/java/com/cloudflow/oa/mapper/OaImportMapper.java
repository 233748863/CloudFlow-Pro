package com.cloudflow.oa.mapper;

import com.cloudflow.oa.domain.SysSupplier;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaImportMapper {
    List<String> existingAssets(@Param("tenantId") long tenantId, @Param("codes") List<String> codes);
    List<SysSupplier> existingSuppliers(@Param("tenantId") long tenantId, @Param("codes") List<String> codes,
                                        @Param("creditCodes") List<String> creditCodes);
}

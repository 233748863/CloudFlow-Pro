package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.excel.importing.ImportReference;
import com.cloudflow.crm.domain.CrmOpportunity;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmImportMapper {
    List<ImportReference> owners(@Param("tenantId") long tenantId);
    @InterceptorIgnore(tenantLine = "true")
    List<ImportReference> levels(@Param("tenantId") long tenantId);
    List<String> existingCustomers(@Param("tenantId") long tenantId, @Param("codes") List<String> codes);
    List<ImportReference> opportunityCustomers(@Param("tenantId") long tenantId, @Param("dataScope") DataScope dataScope);
    List<ImportReference> opportunityContacts(@Param("tenantId") long tenantId, @Param("dataScope") DataScope dataScope);
    Page<CrmOpportunity> updateOpportunities(Page<CrmOpportunity> page, @Param("tenantId") long tenantId,
            @Param("operatorId") long operatorId, @Param("afterId") long afterId, @Param("keyword") String keyword,
            @Param("dataScope") DataScope dataScope);
}

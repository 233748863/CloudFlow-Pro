package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmEmailRecord;
import com.cloudflow.crm.domain.dto.CrmEmailQuery;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmEmailRecordMapper extends BaseMapper<CrmEmailRecord> {
    Page<CrmEmailRecord> pageAccessible(Page<CrmEmailRecord> page, @Param("tenantId") Long tenantId,
            @Param("query") CrmEmailQuery query, @Param("businessTypes") List<String> businessTypes,
            @Param("dataScope") DataScope dataScope);
    CrmEmailRecord accessible(@Param("tenantId") Long tenantId, @Param("emailId") Long emailId,
            @Param("businessTypes") List<String> businessTypes, @Param("dataScope") DataScope dataScope);
    CrmEmailRecord lockById(@Param("tenantId") Long tenantId, @Param("emailId") Long emailId);
    CrmEmailRecord lockByOperation(@Param("tenantId") Long tenantId, @Param("operationKey") String operationKey);
    Long lockOperator(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<String> permissions(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    int observeOpen(@Param("tenantId") Long tenantId, @Param("emailId") Long emailId);
}

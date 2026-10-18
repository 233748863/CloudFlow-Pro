package com.cloudflow.crm.mapper;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmEmailPolicyMapper {
    List<Map<String, String>> configuration(@Param("tenantId") Long tenantId);
}

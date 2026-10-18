package com.cloudflow.crm.mapper;

import com.cloudflow.crm.service.email.CrmEmailAccessService;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmEmailAccessMapper {
    List<CrmEmailAccessService.Role> roles(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    List<Long> departmentTree(@Param("tenantId") Long tenantId, @Param("deptId") Long deptId);
}

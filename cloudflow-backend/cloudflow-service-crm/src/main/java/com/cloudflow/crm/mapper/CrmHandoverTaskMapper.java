package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmHandoverTask;

public interface CrmHandoverTaskMapper extends BaseMapper<CrmHandoverTask> {
    CrmHandoverTask lockById(@org.apache.ibatis.annotations.Param("id") Long id);

    java.util.List<CrmHandoverTask> lockPendingByOwner(@org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
                                                     @org.apache.ibatis.annotations.Param("ownerId") Long ownerId);

    Long lockBusinessOwner(@org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
                           @org.apache.ibatis.annotations.Param("businessType") String businessType,
                           @org.apache.ibatis.annotations.Param("id") Long id);
}

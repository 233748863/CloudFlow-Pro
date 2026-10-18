package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmOpportunity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmOpportunityMapper extends BaseMapper<CrmOpportunity> {
    CrmOpportunity lockById(@Param("id") Long id);
    CrmOpportunity lockAccessible(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("dataScope") DataScope dataScope);
    int writeOpportunity(@Param("record") CrmOpportunity record, @Param("expectedVersion") Integer expectedVersion);
    int initializeTeam(@Param("record") CrmOpportunity record);
    int writeTeam(@Param("record") CrmOpportunity record, @Param("expectedVersion") Integer expectedVersion);

    Page<CrmOpportunity> selectPageByDataScope(Page<CrmOpportunity> page,
                                               @Param("query") CrmOpportunity query,
                                               @Param("dataScope") DataScope dataScope);

    CrmOpportunity selectByIdWithDataScope(@Param("opportunityId") Long opportunityId,
                                           @Param("dataScope") DataScope dataScope);
}

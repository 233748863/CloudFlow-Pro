package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmOpportunity;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmOpportunityMapper extends BaseMapper<CrmOpportunity> {

    Page<CrmOpportunity> selectPageByDataScope(Page<CrmOpportunity> page,
                                               @Param("query") CrmOpportunity query,
                                               @Param("dataScope") DataScope dataScope);

    CrmOpportunity selectByIdWithDataScope(@Param("opportunityId") Long opportunityId,
                                           @Param("dataScope") DataScope dataScope);
}

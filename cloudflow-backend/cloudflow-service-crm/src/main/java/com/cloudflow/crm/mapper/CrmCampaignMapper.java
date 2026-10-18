package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmCampaign;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CrmCampaignMapper extends BaseMapper<CrmCampaign> {
    com.baomidou.mybatisplus.extension.plugins.pagination.Page<CrmCampaign> selectPageByDataScope(com.baomidou.mybatisplus.extension.plugins.pagination.Page<CrmCampaign> page,
            @org.apache.ibatis.annotations.Param("query") CrmCampaign query, @org.apache.ibatis.annotations.Param("dataScope") com.cloudflow.common.datascope.DataScope dataScope);
    CrmCampaign selectAccessible(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("dataScope") com.cloudflow.common.datascope.DataScope dataScope);
    CrmCampaign lockById(@org.apache.ibatis.annotations.Param("id") Long id);
    int refreshWonCount(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId,
            @org.apache.ibatis.annotations.Param("start") java.time.LocalDateTime start, @org.apache.ibatis.annotations.Param("end") java.time.LocalDateTime end,
            @org.apache.ibatis.annotations.Param("version") Integer version, @org.apache.ibatis.annotations.Param("actor") String actor,
            @org.apache.ibatis.annotations.Param("now") java.time.LocalDateTime now);
}

package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmCampaignTargetList;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmCampaignTargetListMapper extends BaseMapper<CrmCampaignTargetList> {
    int deactivateChildren(@Param("parentId") Long parentId);
    int upsert(@Param("entity") CrmCampaignTargetList entity);
}

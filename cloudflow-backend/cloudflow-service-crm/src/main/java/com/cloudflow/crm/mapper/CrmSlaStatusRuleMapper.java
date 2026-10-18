package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmSlaStatusRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmSlaStatusRuleMapper extends BaseMapper<CrmSlaStatusRule> {
    int deactivateChildren(@Param("parentId") Long parentId);
    int upsert(@Param("entity") CrmSlaStatusRule entity);
}

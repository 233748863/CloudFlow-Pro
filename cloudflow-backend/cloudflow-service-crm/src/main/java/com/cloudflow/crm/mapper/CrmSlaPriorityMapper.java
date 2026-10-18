package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmSlaPriority;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmSlaPriorityMapper extends BaseMapper<CrmSlaPriority> {
    int deactivateChildren(@Param("parentId") Long parentId);
    int upsert(@Param("entity") CrmSlaPriority entity);
}

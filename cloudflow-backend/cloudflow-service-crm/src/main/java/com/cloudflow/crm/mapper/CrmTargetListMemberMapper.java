package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmTargetListMember;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmTargetListMemberMapper extends BaseMapper<CrmTargetListMember> {
    int deactivateChildren(@Param("parentId") Long parentId);
    int upsert(@Param("entity") CrmTargetListMember entity);
}

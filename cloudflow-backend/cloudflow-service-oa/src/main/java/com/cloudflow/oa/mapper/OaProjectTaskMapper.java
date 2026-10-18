package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaProjectTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaProjectTaskMapper extends BaseMapper<OaProjectTask> {
    OaProjectTask selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

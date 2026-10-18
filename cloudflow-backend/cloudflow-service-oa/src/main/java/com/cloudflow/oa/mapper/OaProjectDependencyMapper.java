package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaProjectDependency;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OaProjectDependencyMapper extends BaseMapper<OaProjectDependency> {
    OaProjectDependency selectForUpdate(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);
}

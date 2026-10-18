package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaProjectTemplateTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaProjectTemplateTaskMapper extends BaseMapper<OaProjectTemplateTask> {
    OaProjectTemplateTask selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

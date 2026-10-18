package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaTimesheet;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaTimesheetMapper extends BaseMapper<OaTimesheet> {
    OaTimesheet selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

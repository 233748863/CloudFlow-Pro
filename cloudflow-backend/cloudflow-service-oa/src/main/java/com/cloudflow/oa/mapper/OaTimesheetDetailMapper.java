package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaTimesheetDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaTimesheetDetailMapper extends BaseMapper<OaTimesheetDetail> {
    OaTimesheetDetail selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

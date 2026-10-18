package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysJob;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysJobMapper extends BaseMapper<SysJob> {
    SysJob selectIncludingDeleted(@Param("jobId") Long jobId);

    Long lockActiveImportTenant(@Param("tenantId") Long tenantId);
}

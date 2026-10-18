package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysJobLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface SysJobLogMapper extends BaseMapper<SysJobLog> {
    int deleteBefore(@Param("tenantId") Long tenantId, @Param("before") LocalDateTime before);

    SysJobLog lockRunningOrganizationSync(@Param("tenantId") Long tenantId, @Param("executeNo") String executeNo);
}

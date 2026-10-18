package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysJobHandler;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface SysJobHandlerMapper extends BaseMapper<SysJobHandler> {
    int upsert(@Param("serviceName") String serviceName,
               @Param("handlerName") String handlerName,
               @Param("handlerDesc") String handlerDesc,
               @Param("reportTime") LocalDateTime reportTime);
}

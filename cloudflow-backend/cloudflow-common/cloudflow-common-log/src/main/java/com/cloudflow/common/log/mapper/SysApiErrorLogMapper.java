package com.cloudflow.common.log.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SysApiErrorLogMapper extends BaseMapper<SysApiErrorLog> {
}

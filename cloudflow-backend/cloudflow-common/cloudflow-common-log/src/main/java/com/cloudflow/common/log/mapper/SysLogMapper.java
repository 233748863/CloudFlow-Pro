package com.cloudflow.common.log.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.common.log.domain.SysLogEntity;
import org.apache.ibatis.annotations.Mapper;

/**
 * 操作日志 Mapper
 *
 * @author CloudFlow
 */
@Mapper
public interface SysLogMapper extends BaseMapper<SysLogEntity> {
}

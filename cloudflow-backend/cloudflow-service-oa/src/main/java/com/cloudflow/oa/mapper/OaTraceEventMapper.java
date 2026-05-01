package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaTraceEvent;
import org.apache.ibatis.annotations.Mapper;

/**
 * 链路事件 Mapper。
 */
@Mapper
public interface OaTraceEventMapper extends BaseMapper<OaTraceEvent> {
}

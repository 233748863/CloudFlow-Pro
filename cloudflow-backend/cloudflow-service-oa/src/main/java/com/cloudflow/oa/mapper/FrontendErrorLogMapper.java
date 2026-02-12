package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.FrontendErrorLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * 前端错误日志 Mapper 接口
 */
@Mapper
public interface FrontendErrorLogMapper extends BaseMapper<FrontendErrorLog> {
}

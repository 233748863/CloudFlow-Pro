package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysConfig;
import org.apache.ibatis.annotations.Mapper;

/**
 * 系统参数配置 Mapper 接口
 *
 * @author CloudFlow
 */
@Mapper
public interface SysConfigMapper extends BaseMapper<SysConfig> {
}

package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysAssetLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * 资产变动日志 Mapper 接口
 */
@Mapper
public interface SysAssetLogMapper extends BaseMapper<SysAssetLog> {
}

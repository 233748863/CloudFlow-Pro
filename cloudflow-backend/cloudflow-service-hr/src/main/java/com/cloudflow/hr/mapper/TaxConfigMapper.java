package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.TaxConfig;
import org.apache.ibatis.annotations.Mapper;

/**
 * 个税配置Mapper接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Mapper
public interface TaxConfigMapper extends BaseMapper<TaxConfig> {
}

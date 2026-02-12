package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysTenant;
import org.apache.ibatis.annotations.Mapper;

/**
 * 租户Mapper接口
 * 
 * @author CloudFlow
 */
@Mapper
public interface SysTenantMapper extends BaseMapper<SysTenant> {
    
}

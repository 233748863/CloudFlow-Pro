package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.InsuranceScheme;
import org.apache.ibatis.annotations.Mapper;

/**
 * 五险一金方案Mapper接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface InsuranceSchemeMapper extends BaseMapper<InsuranceScheme> {
}

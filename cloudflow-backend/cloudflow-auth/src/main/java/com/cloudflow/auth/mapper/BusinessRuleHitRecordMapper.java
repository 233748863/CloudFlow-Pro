package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import org.apache.ibatis.annotations.Mapper;

/**
 * 业务规则命中记录 Mapper。
 */
@Mapper
public interface BusinessRuleHitRecordMapper extends BaseMapper<BusinessRuleHitRecord> {
}

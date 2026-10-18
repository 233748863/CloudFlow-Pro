package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 业务规则命中记录 Mapper。
 */
@Mapper
public interface BusinessRuleHitRecordMapper extends BaseMapper<BusinessRuleHitRecord> {
    Page<BusinessRuleHitRecord> selectDeduplicatedPage(Page<BusinessRuleHitRecord> page,
            @Param("ruleCode") String ruleCode, @Param("businessType") String businessType,
            @Param("hitResult") String hitResult);
}

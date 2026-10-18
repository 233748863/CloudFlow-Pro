package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierQualificationReminderLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaSupplierQualificationReminderLogMapper extends BaseMapper<OaSupplierQualificationReminderLog> {
    OaSupplierQualificationReminderLog selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

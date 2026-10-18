package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmMassEmail;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmMassEmailMapper extends BaseMapper<CrmMassEmail> {
    CrmMassEmail selectForUpdate(@Param("tenantId") Long tenantId, @Param("massEmailId") Long massEmailId);

    List<Long> due(@Param("tenantId") Long tenantId, @Param("now") LocalDateTime now, @Param("limit") int limit);
}

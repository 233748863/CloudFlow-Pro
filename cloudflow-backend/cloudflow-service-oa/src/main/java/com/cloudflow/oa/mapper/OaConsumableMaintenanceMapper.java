package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaTraceEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface OaConsumableMaintenanceMapper {
    @InterceptorIgnore(tenantLine = "true")
    List<OaRiskAlert> risks(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int sourceDrift(@Param("tenantId") Long tenantId, @Param("id") Long id);
    OaTraceEvent recalculationTrace(@Param("tenantId") Long tenantId, @Param("id") Long id, @Param("key") String key);
    int permissionCount(@Param("tenantId") Long tenantId, @Param("userId") Long userId, @Param("permission") String permission);
}

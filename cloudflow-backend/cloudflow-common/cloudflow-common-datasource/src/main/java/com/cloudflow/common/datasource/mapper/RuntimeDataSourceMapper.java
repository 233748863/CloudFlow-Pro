package com.cloudflow.common.datasource.mapper;

import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.cloudflow.common.datasource.domain.RuntimeDataSourceRegistration;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface RuntimeDataSourceMapper {
    RuntimeDataSourceConfig find(@Param("tenantId") Long tenantId, @Param("configId") Long configId);
    RuntimeDataSourceConfig lock(@Param("tenantId") Long tenantId, @Param("configId") Long configId);
    List<RuntimeDataSourceConfig> page(@Param("tenantId") Long tenantId, @Param("offset") long offset,
            @Param("limit") int limit);
    long count(@Param("tenantId") Long tenantId);
    List<RuntimeDataSourceConfig> scan(@Param("tenantId") Long tenantId, @Param("afterId") long afterId);
    long countKey(@Param("tenantId") Long tenantId, @Param("dsKey") String dsKey);
    int insertConfig(RuntimeDataSourceConfig config);
    int updateConfig(RuntimeDataSourceConfig config);
    int updateActivation(@Param("tenantId") Long tenantId, @Param("configId") Long configId,
            @Param("version") int version, @Param("status") String status, @Param("targetServices") String targetServices,
            @Param("operator") String operator, @Param("now") LocalDateTime now);
    List<RuntimeDataSourceRegistration> registrations(@Param("tenantId") Long tenantId, @Param("configId") Long configId);
    int recordRegistration(RuntimeDataSourceRegistration registration);
    int markUnavailable(@Param("tenantId") Long tenantId, @Param("configId") Long configId,
            @Param("serviceName") String serviceName, @Param("instanceKey") String instanceKey,
            @Param("status") String status, @Param("errorCode") String errorCode,
            @Param("before") LocalDateTime before, @Param("now") LocalDateTime now);
}

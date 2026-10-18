package com.cloudflow.auth.mapper;

import com.cloudflow.auth.im.ImCallbackRow;
import com.cloudflow.auth.im.ImTodoRow;
import com.cloudflow.auth.im.ImCallbackRecovery;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ImCallbackMapper {
    Long configurationTenant(@Param("configId") long configId);
    ImTodoRow todo(@Param("tenantId") long tenantId, @Param("mappingId") long mappingId);
    ImCallbackRow event(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("eventKey") String eventKey);
    Long card(@Param("tenantId") long tenantId, @Param("configId") long configId, @Param("cardKeyHash") String cardKeyHash);
    int insertEvent(ImCallbackRow row);
    List<Long> pending(@Param("tenantId") long tenantId, @Param("limit") int limit);
    List<ImCallbackRecovery.Target> recoveryTargets(@Param("after") long after, @Param("limit") int limit);
    int claim(@Param("tenantId") long tenantId, @Param("callbackId") long callbackId);
    ImCallbackRow claimed(@Param("tenantId") long tenantId, @Param("callbackId") long callbackId);
    int finish(@Param("tenantId") long tenantId, @Param("callbackId") long callbackId, @Param("claimUntil") LocalDateTime claimUntil,
            @Param("status") String status, @Param("resultCode") String resultCode);
}

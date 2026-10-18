package com.cloudflow.oa.mapper;

import com.cloudflow.common.event.outbox.OutboxEvent;
import com.cloudflow.oa.domain.OaContract;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaContractPerformanceMapper {
    record Confirmation(Long eventId, BigDecimal amount, String currency, Integer teamVersion, String sourceSnapshot) { }

    OutboxEvent latest(@Param("id") Long id, @Param("tenantId") Long tenantId);
    LocalDateTime approvedTime(@Param("contract") OaContract contract);
    boolean customerExists(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<Long> dueContracts(@Param("tenantId") Long tenantId, @Param("afterId") Long afterId,
            @Param("today") LocalDate today, @Param("limit") int limit);
    int completeStartDate(@Param("contract") OaContract contract);
    Confirmation confirmation(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("eventKey") String eventKey);
}

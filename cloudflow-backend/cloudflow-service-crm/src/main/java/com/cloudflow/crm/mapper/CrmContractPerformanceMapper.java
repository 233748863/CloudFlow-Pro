package com.cloudflow.crm.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Mapper
public interface CrmContractPerformanceMapper {
    record Contract(Long contractId, Long tenantId, Long customerId, String currency, Integer version, String contractType,
            String instanceId, LocalDate startDate, LocalDate endDate, Integer signedFlag, Long ourSigneeId,
            LocalDateTime ourSignTime, String counterpartySignee, LocalDateTime counterpartySignTime, String signedFileUrl) { }

    Contract lockContract(@Param("id") Long id, @Param("tenantId") Long tenantId);
}

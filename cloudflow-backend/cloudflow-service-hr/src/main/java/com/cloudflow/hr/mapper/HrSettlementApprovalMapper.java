package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Param;

public interface HrSettlementApprovalMapper {
    Long pendingSettlement(@Param("tenantId") Long tenantId, @Param("taskId") String taskId, @Param("actor") Long actor);
    Long employeeUser(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    String instanceStatus(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId,
                          @Param("settlementId") Long settlementId, @Param("revision") Integer revision,
                          @Param("submitter") Long submitter, @Param("definitionId") String definitionId);
    int decisionMatches(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId,
                        @Param("status") String status, @Param("actor") Long actor, @Param("nodeId") String nodeId);
}

package com.cloudflow.crm.mapper;

import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmRefundWorkflowMapper {
    record Participant(Long userId, String name) { }
    record Definition(String definitionId, String processKey, Integer version, String modelJson) { }
    record Instance(String instanceId, String definitionId, String processDefKey, String businessKey,
            Long startUserId, String status, String variables) { }
    record History(String taskId, String nodeKey, Long operatorId, Long onBehalfOfUserId,
            String action, String taskType, LocalDateTime createTime) { }

    Participant activeUser(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    Participant customerOwner(@Param("tenantId") Long tenantId, @Param("customerId") Long customerId);
    List<Participant> financeReviewers(@Param("tenantId") Long tenantId, @Param("applicantId") Long applicantId,
            @Param("ownerId") Long ownerId);
    boolean canComplete(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    Definition definition(@Param("tenantId") Long tenantId);
    Definition definitionById(@Param("tenantId") Long tenantId, @Param("definitionId") String definitionId);
    Instance instance(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId);
    List<History> histories(@Param("tenantId") Long tenantId, @Param("instanceId") String instanceId);
}

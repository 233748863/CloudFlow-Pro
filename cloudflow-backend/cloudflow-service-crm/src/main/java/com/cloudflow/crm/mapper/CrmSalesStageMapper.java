package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.domain.CrmOpportunityStageHistory;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmSalesStageMapper extends BaseMapper<CrmSalesStage> {
    Long lockTenant(@Param("tenantId") Long tenantId);
    List<CrmSalesStage> lockCatalog(@Param("tenantId") Long tenantId);
    CrmContact lockContact(@Param("tenantId") Long tenantId, @Param("contactId") Long contactId, @Param("customerId") Long customerId);
    int referenced(@Param("tenantId") Long tenantId, @Param("stageCode") String stageCode);
    int activityCount(@Param("tenantId") Long tenantId, @Param("opportunityId") Long opportunityId, @Param("customerId") Long customerId);
    CrmOpportunityStageHistory latestHistory(@Param("tenantId") Long tenantId, @Param("opportunityId") Long opportunityId);
    List<Long> pendingNoticeIds(@Param("tenantId") Long tenantId, @Param("afterId") Long afterId, @Param("now") LocalDateTime now);
    int refreshDurations(@Param("tenantId") Long tenantId, @Param("now") LocalDateTime now);
    boolean recipientPermission(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
}

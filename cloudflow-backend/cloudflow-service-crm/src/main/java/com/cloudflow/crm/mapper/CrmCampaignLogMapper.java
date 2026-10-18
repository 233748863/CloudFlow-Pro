package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmCampaignLog;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmCampaignLogMapper extends BaseMapper<CrmCampaignLog> {
    int insertOnce(CrmCampaignLog event);

    List<Map<String, Object>> counts(@Param("tenantId") Long tenantId, @Param("campaignId") Long campaignId);

    List<Long> selectArchiveCandidateIds(@Param("tenantId") Long tenantId,
            @Param("cutoff") LocalDateTime cutoff, @Param("batchLimit") int batchLimit);

    CrmCampaignLog lockArchiveCandidate(@Param("tenantId") Long tenantId,
            @Param("logId") Long logId, @Param("cutoff") LocalDateTime cutoff);

    int archiveDetails(@Param("tenantId") Long tenantId, @Param("event") CrmCampaignLog event);
}

package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageTemplate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysMessageDeliveryMapper extends BaseMapper<SysMessageDelivery> {
    SysMessageDelivery lockDelivery(@Param("tenantId") Long tenantId, @Param("deliveryId") Long deliveryId);

    SysMessageChannel lockChannel(@Param("tenantId") Long tenantId, @Param("channelId") Long channelId);

    SysMessageTemplate lockTemplate(@Param("tenantId") Long tenantId, @Param("templateId") Long templateId);

    boolean duplicated(@Param("tenantId") Long tenantId, @Param("deliveryId") Long deliveryId,
            @Param("receiverKey") String receiverKey, @Param("templateCode") String templateCode,
            @Param("channelType") String channelType, @Param("bizId") String bizId, @Param("cutoff") LocalDateTime cutoff);

    List<Long> due(@Param("tenantId") Long tenantId, @Param("now") LocalDateTime now, @Param("limit") int limit);

    com.cloudflow.auth.domain.MessageAttemptCounts attemptCounts(@Param("tenantId") Long tenantId,
            @Param("channelId") Long channelId, @Param("day") LocalDateTime day,
            @Param("minute") LocalDateTime minute);

    int insertAttempt(@Param("tenantId") Long tenantId, @Param("deliveryId") Long deliveryId,
            @Param("attemptNo") int attemptNo, @Param("channelId") Long channelId,
            @Param("startedAt") LocalDateTime startedAt);

    int deleteAttempt(@Param("tenantId") Long tenantId, @Param("deliveryId") Long deliveryId,
            @Param("attemptNo") int attemptNo);

    int writeState(@Param("delivery") SysMessageDelivery delivery);
}

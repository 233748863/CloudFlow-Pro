package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.ParticipantBusy;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.crm.mapper.CrmActivityMapper;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmParticipantBusyService {
    private final CrmActivityMapper activities;

    public List<ParticipantBusy> query(List<Long> userIds, LocalDateTime start, LocalDateTime end) {
        Long viewerId = UserContext.getUserId();
        if (viewerId == null) throw new ServiceException("登录上下文缺失", 401);
        if (start == null || end == null || !start.isBefore(end) || Duration.between(start, end).compareTo(Duration.ofDays(31)) > 0) {
            throw new ServiceException("参与者冲突查询每次最多31天");
        }
        if (userIds == null || userIds.isEmpty() || userIds.size() > 500
                || userIds.stream().anyMatch(userId -> userId == null || userId <= 0)) throw new ServiceException("参与者范围无效");
        List<Long> requested = userIds.stream().distinct().sorted().toList();
        Long tenantId = CrmRecordSupport.tenantId();
        if (activities.activeParticipantCount(tenantId, requested) != requested.size()) throw new ServiceException("参与者不存在或不属于当前租户", 403);
        return activities.participantBusy(tenantId, requested, viewerId, start, end);
    }
}

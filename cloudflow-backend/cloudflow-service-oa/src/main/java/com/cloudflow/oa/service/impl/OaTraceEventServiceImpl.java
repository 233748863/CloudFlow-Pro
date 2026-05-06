package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.mapper.OaTraceEventMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.util.OaBorrowConstants;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * OA 链路事件服务实现。
 */
@Service
public class OaTraceEventServiceImpl extends ServiceImpl<OaTraceEventMapper, OaTraceEvent>
        implements IOaTraceEventService {

    @Override
    public void record(OaTraceEvent event) {
        if (event == null || event.getBusinessId() == null || !StringUtils.hasText(event.getBusinessType())) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        if (event.getTenantId() == null) {
            event.setTenantId(resolveTenantId());
        }
        if (event.getEventTime() == null) {
            event.setEventTime(now);
        }
        if (!StringUtils.hasText(event.getOperatorName())) {
            event.setOperatorName(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
        }
        if (event.getOperatorId() == null) {
            event.setOperatorId(UserContext.getUserId());
        }
        event.setCreateBy(event.getOperatorName());
        event.setCreateTime(now);
        save(event);
    }

    @Override
    public void record(Long tenantId, String businessType, Long businessId, String relatedType, Long relatedId,
                       String eventType, String eventTitle, String eventContent, Long operatorId,
                       String operatorName, String snapshotJson) {
        OaTraceEvent event = new OaTraceEvent();
        event.setTenantId(tenantId);
        event.setBusinessType(businessType);
        event.setBusinessId(businessId);
        event.setRelatedType(relatedType);
        event.setRelatedId(relatedId);
        event.setEventType(eventType);
        event.setEventTitle(eventTitle);
        event.setEventContent(eventContent);
        event.setOperatorId(operatorId);
        event.setOperatorName(operatorName);
        event.setSnapshotJson(snapshotJson);
        record(event);
    }

    @Override
    public List<OaTraceEvent> listByBusiness(String businessType, Long businessId) {
        return list(new LambdaQueryWrapper<OaTraceEvent>()
                .eq(OaTraceEvent::getBusinessType, businessType)
                .eq(OaTraceEvent::getBusinessId, businessId)
                .orderByAsc(OaTraceEvent::getEventTime)
                .orderByAsc(OaTraceEvent::getId));
    }

    @Override
    public List<OaTraceEvent> listByRelated(String relatedType, Long relatedId) {
        return list(new LambdaQueryWrapper<OaTraceEvent>()
                .eq(OaTraceEvent::getRelatedType, relatedType)
                .eq(OaTraceEvent::getRelatedId, relatedId)
                .orderByAsc(OaTraceEvent::getEventTime)
                .orderByAsc(OaTraceEvent::getId));
    }

    @Override
    public List<OaTraceEvent> listByFilter(String businessType, Long businessId, String relatedType, Long relatedId, Integer limit) {
        int safeLimit = normalizeLimit(limit);
        return list(new LambdaQueryWrapper<OaTraceEvent>()
                .eq(StringUtils.hasText(businessType), OaTraceEvent::getBusinessType, businessType)
                .eq(businessId != null, OaTraceEvent::getBusinessId, businessId)
                .eq(StringUtils.hasText(relatedType), OaTraceEvent::getRelatedType, relatedType)
                .eq(relatedId != null, OaTraceEvent::getRelatedId, relatedId)
                .orderByAsc(OaTraceEvent::getEventTime)
                .orderByAsc(OaTraceEvent::getId)
                .last("LIMIT " + safeLimit));
    }

    @Override
    public List<OaTraceEvent> listRecent(Integer limit) {
        int safeLimit = normalizeLimit(limit);
        return list(new LambdaQueryWrapper<OaTraceEvent>()
                .orderByDesc(OaTraceEvent::getEventTime)
                .orderByDesc(OaTraceEvent::getId)
                .last("LIMIT " + safeLimit));
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return 20;
        }
        return Math.min(limit, 100);
    }
}

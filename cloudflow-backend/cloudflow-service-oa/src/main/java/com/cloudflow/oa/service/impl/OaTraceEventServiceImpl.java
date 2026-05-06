package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.AuditEventQueryDTO;
import com.cloudflow.oa.domain.dto.TimelineDiffDTO;
import com.cloudflow.oa.mapper.OaTraceEventMapper;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;

/**
 * OA 链路事件服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaTraceEventServiceImpl extends ServiceImpl<OaTraceEventMapper, OaTraceEvent>
        implements IOaTraceEventService {

    private final ObjectMapper objectMapper;

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

    @Override
    public Page<OaTraceEvent> queryAuditEvents(AuditEventQueryDTO query) {
        AuditEventQueryDTO safeQuery = query == null ? new AuditEventQueryDTO() : query;
        LambdaQueryWrapper<OaTraceEvent> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StringUtils.hasText(safeQuery.getBusinessType()), OaTraceEvent::getBusinessType, trimUpper(safeQuery.getBusinessType()))
                .eq(safeQuery.getBusinessId() != null, OaTraceEvent::getBusinessId, safeQuery.getBusinessId())
                .eq(StringUtils.hasText(safeQuery.getEventType()), OaTraceEvent::getEventType, trimUpper(safeQuery.getEventType()))
                .like(StringUtils.hasText(safeQuery.getOperatorName()), OaTraceEvent::getOperatorName, safeQuery.getOperatorName())
                .ge(safeQuery.getBeginTime() != null, OaTraceEvent::getEventTime, safeQuery.getBeginTime())
                .le(safeQuery.getEndTime() != null, OaTraceEvent::getEventTime, safeQuery.getEndTime())
                .orderByDesc(OaTraceEvent::getEventTime)
                .orderByDesc(OaTraceEvent::getId);
        long pageNum = safeQuery.getPageNum() == null || safeQuery.getPageNum() <= 0 ? 1 : safeQuery.getPageNum();
        long pageSize = safeQuery.getPageSize() == null || safeQuery.getPageSize() <= 0 ? 10 : Math.min(safeQuery.getPageSize(), 5001);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public TimelineDiffDTO diff(Long eventId) {
        OaTraceEvent current = getById(eventId);
        if (current == null) {
            return null;
        }
        OaTraceEvent previous = getOne(new LambdaQueryWrapper<OaTraceEvent>()
                .eq(OaTraceEvent::getBusinessType, current.getBusinessType())
                .eq(OaTraceEvent::getBusinessId, current.getBusinessId())
                .and(wrapper -> wrapper.lt(OaTraceEvent::getEventTime, current.getEventTime())
                        .or(inner -> inner.eq(OaTraceEvent::getEventTime, current.getEventTime())
                                .lt(OaTraceEvent::getId, current.getId())))
                .orderByDesc(OaTraceEvent::getEventTime)
                .orderByDesc(OaTraceEvent::getId)
                .last("LIMIT 1"));
        TimelineDiffDTO dto = new TimelineDiffDTO();
        dto.setEventId(current.getId());
        dto.setBusinessType(current.getBusinessType());
        dto.setBusinessId(current.getBusinessId());
        dto.setBeforeSnapshot(previous == null ? null : previous.getSnapshotJson());
        dto.setAfterSnapshot(current.getSnapshotJson());
        dto.setChangedFields(compareSnapshots(dto.getBeforeSnapshot(), dto.getAfterSnapshot()));
        return dto;
    }

    private List<TimelineDiffDTO.ChangedField> compareSnapshots(String beforeSnapshot, String afterSnapshot) {
        Map<String, Object> before = parseSnapshot(beforeSnapshot);
        Map<String, Object> after = parseSnapshot(afterSnapshot);
        TreeSet<String> fields = new TreeSet<>();
        fields.addAll(before.keySet());
        fields.addAll(after.keySet());
        List<TimelineDiffDTO.ChangedField> changes = new ArrayList<>();
        for (String field : fields) {
            Object beforeValue = before.get(field);
            Object afterValue = after.get(field);
            if (!Objects.equals(beforeValue, afterValue)) {
                TimelineDiffDTO.ChangedField changedField = new TimelineDiffDTO.ChangedField();
                changedField.setField(field);
                changedField.setBeforeValue(beforeValue);
                changedField.setAfterValue(afterValue);
                changes.add(changedField);
            }
        }
        return changes;
    }

    private Map<String, Object> parseSnapshot(String snapshotJson) {
        if (!StringUtils.hasText(snapshotJson)) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(snapshotJson, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException e) {
            return new LinkedHashMap<>();
        }
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

    private String trimUpper(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase() : value;
    }
}

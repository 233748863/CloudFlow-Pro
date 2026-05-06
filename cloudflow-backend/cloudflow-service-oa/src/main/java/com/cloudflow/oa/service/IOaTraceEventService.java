package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.AuditEventQueryDTO;
import com.cloudflow.oa.domain.dto.TimelineDiffDTO;

import java.util.List;

/**
 * OA 链路事件服务。
 */
public interface IOaTraceEventService extends IService<OaTraceEvent> {

    void record(OaTraceEvent event);

    void record(Long tenantId, String businessType, Long businessId, String relatedType, Long relatedId,
                String eventType, String eventTitle, String eventContent, Long operatorId,
                String operatorName, String snapshotJson);

    List<OaTraceEvent> listByBusiness(String businessType, Long businessId);

    List<OaTraceEvent> listByRelated(String relatedType, Long relatedId);

    List<OaTraceEvent> listByFilter(String businessType, Long businessId, String relatedType, Long relatedId, Integer limit);

    List<OaTraceEvent> listRecent(Integer limit);

    Page<OaTraceEvent> queryAuditEvents(AuditEventQueryDTO query);

    TimelineDiffDTO diff(Long eventId);
}

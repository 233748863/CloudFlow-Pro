package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.OaTraceEvent;

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
}

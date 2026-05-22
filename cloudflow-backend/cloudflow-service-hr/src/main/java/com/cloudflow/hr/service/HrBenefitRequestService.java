package com.cloudflow.hr.service;

import java.util.Map;

public interface HrBenefitRequestService {

    Long createRequest(Map<String, Object> payload);

    void updateRequest(Long requestId, Map<String, Object> payload);

    Map<String, Object> page(Map<String, Object> query);

    Map<String, Object> get(Long requestId);

    Map<String, Object> listMine(Map<String, Object> query);

    String submitWorkflow(Long requestId);

    void cancelRequest(Long requestId, String reason);
}

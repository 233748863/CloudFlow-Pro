package com.cloudflow.hr.service;

import java.util.Map;

public interface HrDisputeArbitrationService {

    Long createArbitration(Long disputeId, Map<String, Object> payload);

    void updateArbitration(Long arbitrationId, Map<String, Object> payload);

    Map<String, Object> listByDispute(Long disputeId);
}

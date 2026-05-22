package com.cloudflow.hr.service;

import java.util.Map;

public interface HrDisputeMediationService {

    Long createMediation(Long disputeId, Map<String, Object> payload);

    void updateMediation(Long mediationId, Map<String, Object> payload);

    Map<String, Object> listByDispute(Long disputeId);
}

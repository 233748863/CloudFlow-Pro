package com.cloudflow.hr.service;

import java.util.Map;

public interface HrLaborDisputeService {

    Long registerDispute(Map<String, Object> payload);

    void updateDispute(Long disputeId, Map<String, Object> payload);

    Map<String, Object> page(Map<String, Object> query);

    Map<String, Object> get(Long disputeId);

    String submitWorkflow(Long disputeId);

    void close(Long disputeId, String reason);

    Long attachEvidence(Long disputeId, Map<String, Object> payload);

    Map<String, Object> listEvidence(Long disputeId);
}

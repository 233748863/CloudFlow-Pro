package com.cloudflow.hr.service;

import java.util.Map;

public interface HrWorkInjuryInvestigationService {

    Long createInvestigation(Long injuryId, Map<String, Object> payload);

    void updateInvestigation(Long investigationId, Map<String, Object> payload);

    Map<String, Object> listByInjury(Long injuryId);
}

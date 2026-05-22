package com.cloudflow.hr.service;

import java.util.Map;

public interface HrWorkInjuryCompensationService {

    Long createCompensation(Long injuryId, Map<String, Object> payload);

    void updateCompensation(Long compensationId, Map<String, Object> payload);

    Map<String, Object> listByInjury(Long injuryId);

    void markPaid(Long compensationId);
}

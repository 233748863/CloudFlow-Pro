package com.cloudflow.hr.service;

import java.util.Map;

public interface HrWorkInjuryTreatmentService {

    Long createTreatment(Long injuryId, Map<String, Object> payload);

    void updateTreatment(Long treatmentId, Map<String, Object> payload);

    Map<String, Object> listByInjury(Long injuryId);
}

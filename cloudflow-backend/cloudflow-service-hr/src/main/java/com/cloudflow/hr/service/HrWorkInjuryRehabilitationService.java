package com.cloudflow.hr.service;

import java.util.Map;

public interface HrWorkInjuryRehabilitationService {

    Long createRehabilitation(Long injuryId, Map<String, Object> payload);

    void updateRehabilitation(Long rehabilitationId, Map<String, Object> payload);

    Map<String, Object> listByInjury(Long injuryId);
}

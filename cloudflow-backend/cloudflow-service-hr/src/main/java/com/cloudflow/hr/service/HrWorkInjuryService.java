package com.cloudflow.hr.service;

import java.util.Map;

public interface HrWorkInjuryService {

    Long createInjury(Map<String, Object> payload);

    void updateInjury(Long injuryId, Map<String, Object> payload);

    Map<String, Object> page(Map<String, Object> query);

    Map<String, Object> listMine(Map<String, Object> query);

    Map<String, Object> get(Long injuryId);

    String submitDetermination(Long injuryId);

    void close(Long injuryId, String reason);
}

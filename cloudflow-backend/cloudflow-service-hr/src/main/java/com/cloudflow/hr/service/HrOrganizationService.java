package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrHeadcount;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class HrOrganizationService {

    private final HrTypedCrudService crudService;
    private final HrViewSupport viewSupport;

    public void setHeadcountActualCount(Long id, Integer actualCount) {
        Map<String, Object> row = crudService.get(HrHeadcount.class, id);
        if (row.isEmpty()) {
            return;
        }
        int approved = viewSupport.toInt(row.get("approvedCount"), 0);
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("actualCount", actualCount);
        updates.put("vacancyCount", approved - (actualCount == null ? 0 : actualCount));
        crudService.updateProperties(HrHeadcount.class, id, updates);
    }

    public Map<String, Object> getHeadcountStatistics(Long id) {
        Map<String, Object> row = crudService.get(HrHeadcount.class, id);
        if (row.isEmpty()) {
            return row;
        }
        int approved = viewSupport.toInt(row.get("approvedCount"), 0);
        int actual = viewSupport.toInt(row.get("actualCount"), 0);
        int vacancy = approved - actual;
        row = new LinkedHashMap<>(row);
        row.put("vacancyCount", vacancy);
        row.put("utilizationRate", approved == 0 ? 0D : Math.round((actual * 10000.0D) / approved) / 100.0D);
        return row;
    }
}

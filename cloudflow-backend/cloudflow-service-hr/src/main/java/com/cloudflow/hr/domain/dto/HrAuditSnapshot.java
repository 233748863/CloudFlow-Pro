package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.util.LinkedHashMap;
import java.util.Map;

@Data
public class HrAuditSnapshot {

    private String tableName;
    private Long businessId;
    private Map<String, Object> data;

    public HrAuditSnapshot(String tableName, Long businessId, Map<String, Object> data) {
        this.tableName = tableName;
        this.businessId = businessId;
        this.data = data == null ? Map.of() : new LinkedHashMap<>(data);
    }
}

package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class HrLeaveEncashmentComponentService {
    private final HrCompComponentMapper components;

    public HrCompComponent requireComponent(Long componentId) {
        HrCompComponent component = componentId == null || componentId <= 0 ? null : components.selectById(componentId);
        if (component == null || !Objects.equals(component.getTenantId(), HrRuleSupport.tenantId())
                || !Integer.valueOf(1).equals(component.getStatus())) {
            throw new HrBusinessException("ENCASHMENT_COMPONENT_INVALID", "折现须指定本租户已启用的薪酬项");
        }
        return component;
    }

    public Map<String, Object> payrollIdentity(Long componentId) {
        HrCompComponent component = requireComponent(componentId);
        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("salaryComponentId", component.getId().toString());
        identity.put("salaryComponentCode", component.getComponentCode());
        identity.put("salaryComponentName", component.getComponentName());
        identity.put("salaryComponentVersion", component.getVersion());
        identity.put("salaryComponentIdentity", "VERIFIED");
        return identity;
    }
}

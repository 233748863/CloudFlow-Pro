package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrWorkInjuryTreatment;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryTreatmentMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrWorkInjuryTreatmentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkInjuryTreatmentServiceImpl implements HrWorkInjuryTreatmentService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryTreatmentMapper treatmentMapper;
    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createTreatment(Long injuryId, Map<String, Object> payload) {
        if (injuryMapper.selectById(injuryId) == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        HrWorkInjuryTreatment treatment = objectMapper.convertValue(payload, HrWorkInjuryTreatment.class);
        treatment.setInjuryId(injuryId);
        treatment.setTenantId(currentTenantId());
        treatment.setDeleted(0);
        treatment.setCreateBy(currentUserName());
        treatment.setUpdateBy(currentUserName());
        treatmentMapper.insert(treatment);
        return treatment.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateTreatment(Long treatmentId, Map<String, Object> payload) {
        crudService.updateProperties(HrWorkInjuryTreatment.class, treatmentId, payload);
    }

    @Override
    public Map<String, Object> listByInjury(Long injuryId) {
        QueryWrapper<HrWorkInjuryTreatment> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("injury_id", injuryId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrWorkInjuryTreatment> rows = treatmentMapper.selectList(qw);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows == null ? new LinkedList<>() : rows);
        result.put("total", rows == null ? 0 : rows.size());
        return result;
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}

package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryTreatmentDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjuryTreatment;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryTreatmentVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryTreatmentMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrWorkInjuryTreatmentService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkInjuryTreatmentServiceImpl implements IHrWorkInjuryTreatmentService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryTreatmentMapper treatmentMapper;
    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createTreatment(Long injuryId, HrWorkInjuryTreatmentDTO dto) {
        if (injuryMapper.selectById(injuryId) == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        HrWorkInjuryTreatment treatment = objectMapper.convertValue(dto, HrWorkInjuryTreatment.class);
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
    @Audit(name = "更新工伤治疗")
    public void updateTreatment(Long treatmentId, HrWorkInjuryTreatmentDTO dto) {
        crudService.updateProperties(HrWorkInjuryTreatment.class, treatmentId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public List<HrWorkInjuryTreatmentVO> listByInjury(Long injuryId) {
        QueryWrapper<HrWorkInjuryTreatment> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("injury_id", injuryId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrWorkInjuryTreatment> rows = treatmentMapper.selectList(qw);
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        return MapConverters.toVOList(rows, HrWorkInjuryTreatmentVO.class, objectMapper);
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

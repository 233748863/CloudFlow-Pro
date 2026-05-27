package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryInvestigationDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjuryInvestigation;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryInvestigationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryInvestigationMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrWorkInjuryInvestigationService;
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
public class HrWorkInjuryInvestigationServiceImpl implements IHrWorkInjuryInvestigationService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryInvestigationMapper investigationMapper;
    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createInvestigation(Long injuryId, HrWorkInjuryInvestigationDTO dto) {
        if (injuryMapper.selectById(injuryId) == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        HrWorkInjuryInvestigation investigation = objectMapper.convertValue(dto, HrWorkInjuryInvestigation.class);
        investigation.setInjuryId(injuryId);
        investigation.setTenantId(currentTenantId());
        investigation.setDeleted(0);
        investigation.setCreateBy(currentUserName());
        investigation.setUpdateBy(currentUserName());
        investigationMapper.insert(investigation);
        return investigation.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateInvestigation(Long investigationId, HrWorkInjuryInvestigationDTO dto) {
        crudService.updateProperties(HrWorkInjuryInvestigation.class, investigationId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public List<HrWorkInjuryInvestigationVO> listByInjury(Long injuryId) {
        QueryWrapper<HrWorkInjuryInvestigation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("injury_id", injuryId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrWorkInjuryInvestigation> rows = investigationMapper.selectList(qw);
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        return MapConverters.toVOList(rows, HrWorkInjuryInvestigationVO.class, objectMapper);
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

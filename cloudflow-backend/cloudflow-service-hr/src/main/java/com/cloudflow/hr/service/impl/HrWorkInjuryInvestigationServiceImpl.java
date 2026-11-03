package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryInvestigationDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjuryInvestigation;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryInvestigationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryInvestigationMapper;
import com.cloudflow.hr.service.HrWorkInjuryAccess;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrWorkInjuryInvestigationService;
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
public class HrWorkInjuryInvestigationServiceImpl implements IHrWorkInjuryInvestigationService {

    private final HrWorkInjuryInvestigationMapper investigationMapper;
    private final HrWorkInjuryAccess injuryAccess;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createInvestigation(Long injuryId, HrWorkInjuryInvestigationDTO dto) {
        injuryAccess.require(injuryId);
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
    @Audit(name = "更新工伤调查")
    public void updateInvestigation(Long investigationId, HrWorkInjuryInvestigationDTO dto) {
        requireRecord(investigationId);
        crudService.updateProperties(HrWorkInjuryInvestigation.class, investigationId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public List<HrWorkInjuryInvestigationVO> listByInjury(Long injuryId) {
        injuryAccess.require(injuryId);
        QueryWrapper<HrWorkInjuryInvestigation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("injury_id", injuryId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrWorkInjuryInvestigation> rows = investigationMapper.selectList(qw);
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        return MapConverters.toVOList(rows, HrWorkInjuryInvestigationVO.class, objectMapper);
    }

    private HrWorkInjuryInvestigation requireRecord(Long id) {
        HrWorkInjuryInvestigation record = investigationMapper.selectOne(new QueryWrapper<HrWorkInjuryInvestigation>()
                .eq("id", id).eq("tenant_id", currentTenantId()).eq("deleted", 0));
        if (record == null) throw new HrBusinessException("WORK_INJURY_RECORD_NOT_FOUND", "工伤子记录不存在");
        injuryAccess.require(record.getInjuryId());
        return record;
    }

    private long currentTenantId() {
        return HrRuleSupport.tenantId();
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}

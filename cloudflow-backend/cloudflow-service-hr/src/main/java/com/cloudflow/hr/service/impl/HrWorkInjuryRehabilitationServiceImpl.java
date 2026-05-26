package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryRehabilitationDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjuryRehabilitation;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryRehabilitationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryRehabilitationMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrWorkInjuryRehabilitationService;
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
public class HrWorkInjuryRehabilitationServiceImpl implements HrWorkInjuryRehabilitationService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryRehabilitationMapper rehabilitationMapper;
    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createRehabilitation(Long injuryId, HrWorkInjuryRehabilitationDTO dto) {
        if (injuryMapper.selectById(injuryId) == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        HrWorkInjuryRehabilitation rehab = objectMapper.convertValue(dto, HrWorkInjuryRehabilitation.class);
        rehab.setInjuryId(injuryId);
        rehab.setTenantId(currentTenantId());
        if (!StringUtils.hasText(rehab.getStatus())) {
            rehab.setStatus("IN_REHAB");
        }
        rehab.setDeleted(0);
        rehab.setCreateBy(currentUserName());
        rehab.setUpdateBy(currentUserName());
        rehabilitationMapper.insert(rehab);
        return rehab.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateRehabilitation(Long rehabilitationId, HrWorkInjuryRehabilitationDTO dto) {
        crudService.updateProperties(HrWorkInjuryRehabilitation.class, rehabilitationId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public List<HrWorkInjuryRehabilitationVO> listByInjury(Long injuryId) {
        QueryWrapper<HrWorkInjuryRehabilitation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("injury_id", injuryId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrWorkInjuryRehabilitation> rows = rehabilitationMapper.selectList(qw);
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        return MapConverters.toVOList(rows, HrWorkInjuryRehabilitationVO.class, objectMapper);
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

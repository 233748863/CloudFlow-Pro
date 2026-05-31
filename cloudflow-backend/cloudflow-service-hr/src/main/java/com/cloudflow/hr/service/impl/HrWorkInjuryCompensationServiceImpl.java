package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryCompensationDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjuryCompensation;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryCompensationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryCompensationMapper;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrWorkInjuryCompensationService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkInjuryCompensationServiceImpl implements IHrWorkInjuryCompensationService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryCompensationMapper compensationMapper;
    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createCompensation(Long injuryId, HrWorkInjuryCompensationDTO dto) {
        if (injuryMapper.selectById(injuryId) == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        HrWorkInjuryCompensation compensation = objectMapper.convertValue(dto, HrWorkInjuryCompensation.class);
        compensation.setInjuryId(injuryId);
        compensation.setTenantId(currentTenantId());
        if (!StringUtils.hasText(compensation.getPaymentStatus())) {
            compensation.setPaymentStatus("PLANNED");
        }
        compensation.setDeleted(0);
        compensation.setCreateBy(currentUserName());
        compensation.setUpdateBy(currentUserName());
        compensationMapper.insert(compensation);
        return compensation.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新工伤赔偿")
    public void updateCompensation(Long compensationId, HrWorkInjuryCompensationDTO dto) {
        crudService.updateProperties(HrWorkInjuryCompensation.class, compensationId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public List<HrWorkInjuryCompensationVO> listByInjury(Long injuryId) {
        QueryWrapper<HrWorkInjuryCompensation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("injury_id", injuryId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrWorkInjuryCompensation> rows = compensationMapper.selectList(qw);
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }
        List<HrWorkInjuryCompensationVO> vos = new ArrayList<>(rows.size());
        for (HrWorkInjuryCompensation entity : rows) {
            HrWorkInjuryCompensationVO vo = objectMapper.convertValue(entity, HrWorkInjuryCompensationVO.class);
            String bankAccount = entity.getBankAccount();
            if (StringUtils.hasText(bankAccount)) {
                vo.setBankAccountMasked(mask(bankAccount));
            }
            vos.add(vo);
        }
        return vos;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markPaid(Long compensationId) {
        UpdateWrapper<HrWorkInjuryCompensation> uw = new UpdateWrapper<>();
        uw.eq("id", compensationId).eq("tenant_id", currentTenantId())
                .set("payment_status", "PAID")
                .set("paid_at", LocalDateTime.now())
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        int rows = compensationMapper.update(null, uw);
        if (rows == 0) {
            throw new HrBusinessException("COMPENSATION_NOT_FOUND", "赔偿记录不存在：" + compensationId);
        }
    }

    private static String mask(String value) {
        if (value == null || value.length() <= 4) {
            return "****";
        }
        return "****" + value.substring(value.length() - 4);
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

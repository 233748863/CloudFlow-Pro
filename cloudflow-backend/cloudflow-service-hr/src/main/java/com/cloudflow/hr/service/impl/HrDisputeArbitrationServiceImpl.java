package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrDisputeArbitration;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrDisputeArbitrationMapper;
import com.cloudflow.hr.mapper.HrLaborDisputeMapper;
import com.cloudflow.hr.service.HrDisputeArbitrationService;
import com.cloudflow.hr.service.HrTypedCrudService;
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
public class HrDisputeArbitrationServiceImpl implements HrDisputeArbitrationService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrDisputeArbitrationMapper arbitrationMapper;
    private final HrLaborDisputeMapper disputeMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createArbitration(Long disputeId, Map<String, Object> payload) {
        if (disputeMapper.selectById(disputeId) == null) {
            throw new HrBusinessException("LABOR_DISPUTE_NOT_FOUND", "争议不存在：" + disputeId);
        }
        HrDisputeArbitration arbitration = objectMapper.convertValue(payload, HrDisputeArbitration.class);
        arbitration.setDisputeId(disputeId);
        arbitration.setTenantId(currentTenantId());
        arbitration.setDeleted(0);
        arbitration.setCreateBy(currentUserName());
        arbitration.setUpdateBy(currentUserName());
        arbitrationMapper.insert(arbitration);
        return arbitration.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateArbitration(Long arbitrationId, Map<String, Object> payload) {
        crudService.updateProperties(HrDisputeArbitration.class, arbitrationId, payload);
    }

    @Override
    public Map<String, Object> listByDispute(Long disputeId) {
        QueryWrapper<HrDisputeArbitration> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("dispute_id", disputeId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrDisputeArbitration> rows = arbitrationMapper.selectList(qw);
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

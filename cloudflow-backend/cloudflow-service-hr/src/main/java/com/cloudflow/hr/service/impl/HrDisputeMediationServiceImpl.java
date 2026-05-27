package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.dispute.HrDisputeMediationDTO;
import com.cloudflow.hr.domain.entity.HrDisputeMediation;
import com.cloudflow.hr.domain.vo.dispute.HrDisputeMediationVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrDisputeMediationMapper;
import com.cloudflow.hr.mapper.HrLaborDisputeMapper;
import com.cloudflow.hr.service.IHrDisputeMediationService;
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
public class HrDisputeMediationServiceImpl implements IHrDisputeMediationService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrDisputeMediationMapper mediationMapper;
    private final HrLaborDisputeMapper disputeMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createMediation(Long disputeId, HrDisputeMediationDTO dto) {
        if (disputeMapper.selectById(disputeId) == null) {
            throw new HrBusinessException("LABOR_DISPUTE_NOT_FOUND", "争议不存在：" + disputeId);
        }
        HrDisputeMediation mediation = objectMapper.convertValue(dto, HrDisputeMediation.class);
        mediation.setDisputeId(disputeId);
        mediation.setTenantId(currentTenantId());
        mediation.setDeleted(0);
        mediation.setCreateBy(currentUserName());
        mediation.setUpdateBy(currentUserName());
        mediationMapper.insert(mediation);
        return mediation.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateMediation(Long mediationId, HrDisputeMediationDTO dto) {
        crudService.updateProperties(HrDisputeMediation.class, mediationId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrDisputeMediationVO> listByDispute(Long disputeId) {
        QueryWrapper<HrDisputeMediation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", currentTenantId()).eq("dispute_id", disputeId).eq("deleted", 0)
                .orderByDesc("create_time");
        List<HrDisputeMediation> rows = mediationMapper.selectList(qw);
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("rows", rows == null ? new LinkedList<>() : rows);
        raw.put("total", rows == null ? 0 : rows.size());
        return MapConverters.toPageResult(raw, HrDisputeMediationVO.class, objectMapper);
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

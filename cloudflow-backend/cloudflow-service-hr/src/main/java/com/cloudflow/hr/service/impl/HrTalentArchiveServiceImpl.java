package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.vo.talent.HrTalentArchiveVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTalentArchiveMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrTalentArchiveService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 人才档案聚合查询：单员工历次盘点、所在池、培养行动、继任提名一站式纵览。
 */
@Service
@RequiredArgsConstructor
public class HrTalentArchiveServiceImpl implements IHrTalentArchiveService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrTalentArchiveMapper archiveMapper;
    private final HrEssSupport essSupport;
    private final ObjectMapper objectMapper;

    @Override
    public HrTalentArchiveVO getArchive(Long employeeId) {
        if (employeeId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "employeeId 不能为空");
        }
        long tid = currentTenantId();
        Map<String, Object> employee = archiveMapper.selectEmployeeBrief(employeeId, tid);
        if (employee == null || employee.isEmpty()) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在：" + employeeId);
        }
        List<Map<String, Object>> reviews = archiveMapper.selectArchiveReviews(employeeId, tid);
        List<Map<String, Object>> pools = archiveMapper.selectArchivePools(employeeId, tid);
        List<Map<String, Object>> developmentActions = archiveMapper.selectArchiveDevelopmentActions(employeeId, tid);
        List<Map<String, Object>> successorOf = archiveMapper.selectArchiveSuccessors(employeeId, tid);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("employee", employee);
        result.put("reviews", reviews);
        result.put("pools", pools);
        result.put("developmentActions", developmentActions);
        result.put("successorOf", successorOf);
        return objectMapper.convertValue(result, HrTalentArchiveVO.class);
    }

    @Override
    public HrTalentArchiveVO getMyArchive() {
        Long employeeId = essSupport.currentEmployeeId();
        return getArchive(employeeId);
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }
}

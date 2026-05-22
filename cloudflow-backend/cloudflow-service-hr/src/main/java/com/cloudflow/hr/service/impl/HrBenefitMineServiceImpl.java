package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.domain.entity.HrEmployeeBenefit;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrBenefitRequestMapper;
import com.cloudflow.hr.mapper.HrEmployeeBenefitMapper;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.cloudflow.hr.service.HrBenefitMineService;
import com.cloudflow.hr.service.HrPointAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrBenefitMineServiceImpl implements HrBenefitMineService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrEmployeeBenefitMapper employeeBenefitMapper;
    private final HrBenefitRequestMapper requestMapper;
    private final HrMallOrderMapper orderMapper;
    private final HrPointAccountService pointAccountService;

    @Override
    public Map<String, Object> loadMineSummary() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new HrBusinessException("UNAUTHORIZED", "未登录用户");
        }
        Map<String, Object> result = new LinkedHashMap<>();

        QueryWrapper<HrEmployeeBenefit> beQw = new QueryWrapper<>();
        beQw.eq("tenant_id", currentTenantId()).eq("employee_id", userId).eq("deleted", 0)
                .orderByDesc("create_time").last("LIMIT 50");
        result.put("activeBenefits", employeeBenefitMapper.selectList(beQw));

        result.put("pointAccount", pointAccountService.getEmployeeAccount(userId));

        QueryWrapper<HrMallOrder> orderQw = new QueryWrapper<>();
        orderQw.eq("tenant_id", currentTenantId()).eq("employee_id", userId).eq("deleted", 0)
                .in("status", Arrays.asList("PENDING", "APPROVING", "APPROVED", "SHIPPED"))
                .orderByDesc("create_time").last("LIMIT 20");
        result.put("inFlightOrders", orderMapper.selectList(orderQw));

        QueryWrapper<HrBenefitRequest> reqQw = new QueryWrapper<>();
        reqQw.eq("tenant_id", currentTenantId()).eq("employee_id", userId).eq("deleted", 0)
                .orderByDesc("create_time").last("LIMIT 20");
        result.put("recentRequests", requestMapper.selectList(reqQw));

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
}

package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.domain.entity.HrEmployeeBenefit;
import com.cloudflow.hr.domain.entity.HrMallOrder;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitMineVO;
import com.cloudflow.hr.domain.vo.benefit.HrBenefitRequestVO;
import com.cloudflow.hr.domain.vo.benefit.HrEmployeeBenefitVO;
import com.cloudflow.hr.domain.vo.benefit.HrMallOrderVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrBenefitRequestMapper;
import com.cloudflow.hr.mapper.HrEmployeeBenefitMapper;
import com.cloudflow.hr.mapper.HrMallOrderMapper;
import com.cloudflow.hr.service.IHrBenefitMineService;
import com.cloudflow.hr.service.IHrPointAccountService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrBenefitMineServiceImpl implements IHrBenefitMineService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrEmployeeBenefitMapper employeeBenefitMapper;
    private final HrBenefitRequestMapper requestMapper;
    private final HrMallOrderMapper orderMapper;
    private final IHrPointAccountService pointAccountService;
    private final ObjectMapper objectMapper;

    @Override
    public HrBenefitMineVO loadMineSummary() {
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new HrBusinessException("UNAUTHORIZED", "未登录用户");
        }

        HrBenefitMineVO result = new HrBenefitMineVO();

        QueryWrapper<HrEmployeeBenefit> beQw = new QueryWrapper<>();
        beQw.eq("tenant_id", currentTenantId()).eq("employee_id", userId).eq("deleted", 0)
                .orderByDesc("create_time").last("LIMIT 50");
        List<HrEmployeeBenefit> benefits = employeeBenefitMapper.selectList(beQw);
        result.setActiveBenefits(toVOList(benefits, HrEmployeeBenefitVO.class));

        result.setPointAccount(pointAccountService.getEmployeeAccount(userId));

        QueryWrapper<HrMallOrder> orderQw = new QueryWrapper<>();
        orderQw.eq("tenant_id", currentTenantId()).eq("employee_id", userId).eq("deleted", 0)
                .in("status", Arrays.asList("PENDING", "APPROVING", "APPROVED", "SHIPPED"))
                .orderByDesc("create_time").last("LIMIT 20");
        List<HrMallOrder> orders = orderMapper.selectList(orderQw);
        result.setInFlightOrders(toVOList(orders, HrMallOrderVO.class));

        QueryWrapper<HrBenefitRequest> reqQw = new QueryWrapper<>();
        reqQw.eq("tenant_id", currentTenantId()).eq("employee_id", userId).eq("deleted", 0)
                .orderByDesc("create_time").last("LIMIT 20");
        List<HrBenefitRequest> requests = requestMapper.selectList(reqQw);
        result.setRecentRequests(toVOList(requests, HrBenefitRequestVO.class));

        return result;
    }

    private <S, T> List<T> toVOList(List<S> rows, Class<T> targetClass) {
        if (rows == null || rows.isEmpty()) {
            return new ArrayList<>();
        }
        List<T> result = new ArrayList<>(rows.size());
        for (S row : rows) {
            result.add(objectMapper.convertValue(row, targetClass));
        }
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

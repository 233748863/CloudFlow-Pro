package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrGrievance;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrGrievanceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class HrGrievanceAccessService {
    private final HrEmployeeMapper employeeMapper;
    private final HrGrievanceMapper grievanceMapper;
    private final HrRuleSupport support;
    private final HrEssSupport essSupport;

    public boolean humanResources() {
        return UserContext.getRoles() != null && UserContext.getRoles().contains("hr");
    }

    public Long employeeId() {
        if (UserContext.getUserId() == null) return null;
        HrEmployee employee = employeeMapper.selectOne(new LambdaQueryWrapper<HrEmployee>()
                .eq(HrEmployee::getTenantId, HrRuleSupport.tenantId()).eq(HrEmployee::getDeleted, 0)
                .eq(HrEmployee::getUserId, UserContext.getUserId()));
        return employee == null ? null : employee.getId();
    }

    public LambdaQueryWrapper<HrGrievance> query(boolean mine) {
        Long userId = UserContext.getUserId();
        if (userId == null) throw new HrBusinessException("UNAUTHORIZED", "请先登录");
        LambdaQueryWrapper<HrGrievance> query = new LambdaQueryWrapper<HrGrievance>()
                .eq(HrGrievance::getTenantId, HrRuleSupport.tenantId()).eq(HrGrievance::getDeleted, 0)
                .and(condition -> condition.ne(HrGrievance::getAgainstType, "USER")
                        .or().isNull(HrGrievance::getAgainstId).or().ne(HrGrievance::getAgainstId, userId));
        if (mine) query.eq(HrGrievance::getEmployeeId, essSupport.currentEmployeeId());
        else {
            Long employeeId = employeeId();
            query.ne(employeeId != null, HrGrievance::getEmployeeId, employeeId);
            if (!humanResources()) query.eq(HrGrievance::getHandlerId, userId);
        }
        return query;
    }

    public HrGrievance require(Long grievanceId, boolean mine) {
        HrGrievance grievance = grievanceMapper.selectById(grievanceId);
        if (grievance == null || !Objects.equals(grievance.getTenantId(), HrRuleSupport.tenantId())
                || HrRuleSupport.flag(grievance.getDeleted())) {
            throw new HrBusinessException("FORBIDDEN", "无权访问该申诉");
        }
        Long employeeId = mine ? essSupport.currentEmployeeId() : employeeId();
        boolean allowed = mine ? Objects.equals(employeeId, grievance.getEmployeeId())
                && !HrGrievanceRules.targeted(grievance, UserContext.getUserId())
                : HrGrievanceRules.canManage(grievance, UserContext.getUserId(), employeeId, humanResources());
        if (!allowed) throw new HrBusinessException("FORBIDDEN", "无权访问该申诉");
        return grievance;
    }

    public record DisputeReadScope(List<Long> allowed, List<Long> excluded) { }

    public DisputeReadScope disputeReadScope() {
        Long employeeId = employeeId();
        Long userId = UserContext.getUserId();
        boolean hr = humanResources();
        List<Long> allowed = new ArrayList<>();
        List<Long> excluded = new ArrayList<>();
        for (HrGrievance grievance : grievanceMapper.selectDisputeSources(HrRuleSupport.tenantId(), null)) {
            boolean readable = !HrRuleSupport.flag(grievance.getDeleted())
                    && HrGrievanceRules.canManage(grievance, userId, employeeId, hr);
            (readable ? allowed : excluded).add(grievance.getEscalatedDisputeId());
        }
        return new DisputeReadScope(List.copyOf(allowed), List.copyOf(excluded));
    }

    public void assertDisputeAccess(Long disputeId) {
        HrGrievance grievance = disputeSource(disputeId);
        if (grievance == null) return;
        require(grievance.getGrievanceId(), false);
        support.audit("GRIEVANCE", grievance.getGrievanceId(), "VIEW_LINKED_DISPUTE", Map.of("disputeId", disputeId));
    }

    public HrGrievance linkedDispute(Long disputeId) {
        HrGrievance grievance = disputeSource(disputeId);
        if (grievance == null) throw new HrBusinessException("FORBIDDEN", "该争议没有可访问的申诉材料");
        return require(grievance.getGrievanceId(), false);
    }

    private HrGrievance disputeSource(Long disputeId) {
        if (disputeId == null) throw new HrBusinessException("FORBIDDEN", "无权访问该争议");
        List<HrGrievance> sources = grievanceMapper.selectDisputeSources(HrRuleSupport.tenantId(), disputeId);
        if (sources.size() > 1) throw new HrBusinessException("FORBIDDEN", "争议来源异常，请联系人事核对");
        return sources.isEmpty() ? null : sources.get(0);
    }
}

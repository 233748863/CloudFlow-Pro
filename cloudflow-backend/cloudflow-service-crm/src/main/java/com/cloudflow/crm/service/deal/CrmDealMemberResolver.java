package com.cloudflow.crm.service.deal;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.remote.RemoteHrService;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmDealMemberResolver {
    private final RemoteHrService people;

    public record Assignment(Long userId, String role, BigDecimal percentage, BigDecimal commissionRate) { }
    public record Resolved(List<CrmDealPolicy.Member> members, Map<Long, HrEmployeeSummaryVO> directory) {
        public CrmDealPolicy.Member owner() { return members.stream().filter(member -> "OWNER".equals(member.role())).findFirst().orElseThrow(); }
    }

    public Resolved resolve(List<Assignment> assignments) {
        if (assignments == null || assignments.isEmpty() || assignments.size() > 200) throw invalid("团队须包含1至200名成员");
        HashSet<Long> requested = new HashSet<Long>();
        for (Assignment assignment : assignments) {
            if (assignment == null || assignment.userId() == null || assignment.userId() <= 0 || !requested.add(assignment.userId()))
                throw invalid("团队成员须为有效用户且不可重复");
        }
        R<List<HrEmployeeSummaryVO>> response = people.listEmployeesByUserIds(requested.stream().sorted().toList());
        if (response == null || !response.isSuccess() || response.getData() == null) throw invalid("员工服务暂不可用，团队变更未保存");
        Map<Long, HrEmployeeSummaryVO> directory = new HashMap<>();
        for (HrEmployeeSummaryVO employee : response.getData()) {
            if (employee == null || !requested.contains(employee.getUserId()) || !Objects.equals(CrmRecordSupport.tenantId(), employee.getTenantId())
                    || !employee.isActive() || !employee.isUserEnabled() || !employee.isDepartmentEnabled()
                    || directory.putIfAbsent(employee.getUserId(), employee) != null)
                throw invalid("团队成员须为本租户唯一在职员工，且账号和部门均已启用");
        }
        if (directory.size() != requested.size()) throw invalid("部分团队成员不存在或员工服务暂不可用");
        List<CrmDealPolicy.Member> members = new ArrayList<>();
        for (Assignment assignment : assignments) {
            HrEmployeeSummaryVO employee = directory.get(assignment.userId());
            members.add(new CrmDealPolicy.Member(employee.getUserId(), employee.getEmployeeId(), employee.getEmployeeName(), employee.getDeptId(),
                    assignment.role(), assignment.percentage(), assignment.commissionRate()));
        }
        return new Resolved(CrmDealPolicy.team(members), Map.copyOf(directory));
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}

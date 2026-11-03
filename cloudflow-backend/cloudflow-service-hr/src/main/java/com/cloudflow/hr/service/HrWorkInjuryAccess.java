package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** 工伤主记录及子记录统一通过案件中的员工确定访问范围。 */
@Component
@RequiredArgsConstructor
public class HrWorkInjuryAccess {
    private final HrWorkInjuryMapper injuries;
    private final HrRuleSupport support;

    public HrWorkInjury require(Long injuryId) {
        return require(injuryId, false);
    }

    public HrWorkInjury requireForUpdate(Long injuryId) {
        return require(injuryId, true);
    }

    private HrWorkInjury require(Long injuryId, boolean forUpdate) {
        LambdaQueryWrapper<HrWorkInjury> query = new LambdaQueryWrapper<HrWorkInjury>()
                .eq(HrWorkInjury::getTenantId, HrRuleSupport.tenantId()).eq(HrWorkInjury::getDeleted, 0)
                .eq(HrWorkInjury::getId, injuryId);
        if (forUpdate) query.last("FOR UPDATE");
        HrWorkInjury injury = injuries.selectOne(query);
        if (injury == null) throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在");
        support.assertEmployeeScope(injury.getEmployeeId());
        return injury;
    }

    public <T> void restrict(QueryWrapper<T> query) {
        List<Object> values = new ArrayList<>();
        values.add(HrRuleSupport.tenantId());
        StringBuilder sql = new StringBuilder("EXISTS (SELECT 1 FROM hr_employee injury_employee WHERE injury_employee.id = hr_work_injury.employee_id AND injury_employee.tenant_id = {0} AND injury_employee.deleted = 0");
        Integer scope = UserContext.getDsType();
        if (UserContext.getUserId() != null && scope != null && scope != 0) {
            switch (scope) {
                case 1, 2 -> {
                    List<Long> departments = UserContext.getDsDeptIds();
                    if (departments == null || departments.isEmpty()) sql.append(" AND 1 = 0");
                    else {
                        sql.append(" AND injury_employee.dept_id IN (");
                        for (Long department : departments) {
                            if (values.size() > 1) sql.append(',');
                            sql.append('{').append(values.size()).append('}');
                            values.add(department);
                        }
                        sql.append(')');
                    }
                }
                case 3 -> { sql.append(" AND injury_employee.dept_id = {1}"); values.add(UserContext.getDeptId()); }
                case 4 -> { sql.append(" AND injury_employee.user_id = {1}"); values.add(UserContext.getUserId()); }
                default -> sql.append(" AND 1 = 0");
            }
        }
        query.eq("tenant_id", HrRuleSupport.tenantId()).apply(sql.append(')').toString(), values.toArray());
    }
}

package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.OaOperationsReminderMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaOperationsReminderService {
    private final OaOperationsReminderMapper query;
    private final OaSupplierGovernanceService governance;
    private final OaIdentityReferenceMapper identities;
    private final OaReminderService reminders;
    private final SysConfigHelper config;

    @Audit(name = "提醒供应商周期评分")
    public int supplierScoring() {
        int months = config.getConfigInt("sys.oa.supplier.scorePeriodMonths", 3);
        if (!Set.of(1, 3, 12).contains(months)) throw new IllegalStateException("供应商评分周期须为1、3或12个月");
        LocalDate today = LocalDate.now(); LocalDate current = LocalDate.of(today.getYear(), ((today.getMonthValue() - 1) / months) * months + 1, 1);
        LocalDate start = current.minusMonths(months), end = current.minusDays(1);
        List<SysSupplier> suppliers = query.unscoredSuppliers(OaRecordSupport.tenantId(), start, end);
        if (suppliers.isEmpty()) return 0;
        Long recipient = config.getConfigLong("sys.oa.supplier.qualification.reminderUserId", 1L);
        OaRecordSupport.require(identities.user(recipient, OaRecordSupport.tenantId()), "供应商评分提醒接收人未配置");
        String periodType = months == 12 ? "YEARLY" : months == 3 ? "QUARTERLY" : "MONTHLY";
        for (SysSupplier supplier : suppliers) {
            governance.ensurePendingScorecard(supplier.getSupplierId(), periodType, start, end);
            reminders.send(recipient, "SUPPLIER_SCORING", supplier.getSupplierId().toString(), start + ":" + end, "供应商评分周期已结束", supplier.getSupplierName() + "尚未完成" + start + "至" + end + "期间的评分确认");
        }
        return suppliers.size();
    }

    @Audit(name = "提醒员工填报项目工时")
    public int timesheetFiling() {
        LocalDate end = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusDays(1), start = end.minusDays(6);
        List<OaIdentityReference> employees = query.missingTimesheets(OaRecordSupport.tenantId(), start, end);
        for (OaIdentityReference employee : employees) reminders.send(employee.getUserId(), "TIMESHEET_FILING", employee.getId().toString(), start + ":" + end,
                "项目工时待填报", "请核对并提交" + start + "至" + end + "期间的项目工时；如本周无投入可忽略本次提醒");
        return employees.size();
    }
}

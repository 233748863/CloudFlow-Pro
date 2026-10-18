package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import java.math.BigDecimal;
import java.util.List;
import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

public final class OaProjectMigrationChecks {
    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 1) throw new IllegalArgumentException("An isolated rehearsal JDBC URL is required");
        StpLogic previous = StpUtil.getStpLogic();
        try {
            identity(100000L, 1L);
            OaOperationsDatabaseChecks fixture = new OaOperationsDatabaseChecks(arguments[0], true);
            List<String> tasksBefore = tasks(fixture);
            List<String> projectsBefore = projects(fixture);
            BigDecimal historicalHours = fixture.jdbc.queryForObject("SELECT SUM(COALESCE(actual_hours,0)) FROM oa_work_task WHERE project_id IS NOT NULL", BigDecimal.class);
            decimal(historicalHours.toPlainString(), fixture.jdbc.queryForObject("SELECT SUM(opening_actual_hours) FROM oa_project_task", BigDecimal.class), "all legacy task hours are retained before recalculation");
            List<Long> tenants = fixture.jdbc.queryForList("SELECT DISTINCT tenant_id FROM oa_project WHERE deleted=0 ORDER BY tenant_id", Long.class);
            int recalculated = 0;
            for (int attempt = 0; attempt < 2; attempt++) {
                for (Long tenantId : tenants) {
                    identity(tenantId, 1L);
                    recalculated += fixture.bean(OaProjectAccountingService.class).recalculateAll();
                }
                equal(true, tasksBefore.equals(tasks(fixture)), "all migrated task opening and cumulative hours survive recalculation");
                equal(true, projectsBefore.equals(projects(fixture)), "all migrated project hours and costs survive recalculation");
            }
            equal(0L, fixture.count("SELECT COUNT(*) FROM oa_timesheet"), "historical reconciliation does not create timesheets");
            equal(0L, fixture.count("SELECT COUNT(*) FROM oa_timesheet_detail"), "historical reconciliation does not create timesheet details");
            decimal(historicalHours.toPlainString(), fixture.jdbc.queryForObject("SELECT SUM(opening_actual_hours) FROM oa_project_task", BigDecimal.class), "all historical opening hours remain immutable");
            System.out.println("PASS: migrated projects=" + projectsBefore.size() + ", tasks=" + tasksBefore.size() + ", tenants=" + tenants.size() + ", recalculations=" + recalculated + ", openingHours=" + historicalHours.toPlainString());
        } finally {
            StpUtil.setStpLogic(previous); TenantContext.clear(); UserContext.clear();
        }
    }

    private static List<String> tasks(OaOperationsDatabaseChecks fixture) {
        return fixture.jdbc.queryForList("SELECT CAST(JSON_OBJECT('taskId',task_id,'openingHours',opening_actual_hours,'actualHours',actual_hours) AS CHAR) FROM oa_project_task ORDER BY task_id", String.class);
    }

    private static List<String> projects(OaOperationsDatabaseChecks fixture) {
        return fixture.jdbc.queryForList("SELECT CAST(JSON_OBJECT('projectId',project_id,'actualHours',actual_hours,'actualCost',COALESCE(actual_cost_amount,0),'otherCost',other_cost_amount,'laborCost',labor_cost_amount,'purchaseCost',purchase_cost_amount,'billable',billable_amount,'billed',billed_amount,'grossMargin',gross_margin,'grossMarginRate',gross_margin_rate) AS CHAR) FROM oa_project ORDER BY project_id", String.class);
    }
}

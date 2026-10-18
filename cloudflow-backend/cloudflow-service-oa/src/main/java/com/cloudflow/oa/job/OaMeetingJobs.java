package com.cloudflow.oa.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.service.impl.OaMeetingWorkflowService;
import com.cloudflow.oa.service.impl.OaMeetingReminderService;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OaMeetingJobs {
    private final TenantIterator tenants;
    private final OaMeetingWorkflowService workflow;
    private final OaMeetingReminderService reminders;

    @JobHandler(value = "oaMeetingReminders", desc = "按数据库恢复及派发会议提醒")
    @DistributedJob(name = "oaMeetingReminders", lockTime = 300, waitTime = 1)
    public void oaMeetingReminders() {
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try { reminders.dispatchDue(); }
            catch (RuntimeException failure) { failures.add(new IllegalStateException("会议提醒处理租户" + tenantId + "失败", failure)); }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("会议提醒处理失败租户数：" + failures.size());
            failures.forEach(failure::addSuppressed); throw failure;
        }
    }

    @JobHandler(value = "oaMeetingApprovalExpiry", desc = "会议预约逾期未批关闭")
    @DistributedJob(name = "oaMeetingApprovalExpiry", lockTime = 300, waitTime = 1)
    public void oaMeetingApprovalExpiry() {
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try { workflow.expirePending(); }
            catch (RuntimeException failure) { failures.add(new IllegalStateException("会议逾期处理租户" + tenantId + "失败", failure)); }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("会议逾期处理失败租户数：" + failures.size());
            failures.forEach(failure::addSuppressed); throw failure;
        }
    }
}

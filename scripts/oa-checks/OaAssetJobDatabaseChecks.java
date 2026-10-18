package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.job.OaAssetProjectJobs;
import com.cloudflow.oa.mapper.SysAssetMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaAssetJobDatabaseChecks {
    private OaAssetJobDatabaseChecks() { }

    static void run(OaOperationsDatabaseChecks fixture) {
        // 仅租户目录选择使用替身；任务、资产、审计及每项事务均使用实际实现及独立数据库。
        TenantIterator tenants = new TenantIterator(null) {
            @Override public List<Long> listActiveTenantIds() { return List.of(100090L, 100091L); }
        };
        OaDepreciationService depreciation = fixture.bean(OaDepreciationService.class);
        OaAssetProjectJobs jobs = new OaAssetProjectJobs(tenants, depreciation, fixture.bean(OaAssetMaintenanceService.class), null, null, null, null);
        Long failedAsset = null;
        for (int index = 0; index < 3; index++) {
            identity(index == 0 ? 100090L : 100091L, 0L); UserContext.setUserName("system");
            SysAsset input = asset("STRAIGHT_LINE"); input.setName("资产任务回报检查"); input.setAssetCode(fixture.marker + "-job-audit-" + index);
            input.setPurchaseAmount(number("10")); input.setNetBookValue(number("10")); input.setSalvageValue(BigDecimal.ZERO);
            input.setUsefulLifeMonths(1); input.setDepreciationFrequency("MONTHLY"); input.setAvailableFromDate(LocalDate.now().minusMonths(1));
            OaRecordSupport.create(input, "assetId"); fixture.mapper(SysAssetMapper.class).insert(input); depreciation.generatePlan(input.getAssetId());
            if (index == 0) failedAsset = input.getAssetId();
        }
        Long target = failedAsset;
        String failedExecution = UUID.randomUUID().toString();
        fixture.jdbc.execute("CREATE TRIGGER f1_job_owned_audit_failure BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN "
                + "IF NEW.tenant_id=100090 AND NEW.audit_field='DEPRECIATION_POSTED' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.after_json,'$.assetId'))='" + target
                + "' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='owned job audit failure'; END IF; END");
        try {
            fails(IllegalStateException.class, () -> invoke(jobs, failedExecution), "asset job propagates tenant failure instead of reporting success");
            equal(1L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100090 AND asset_id=? AND status='PLANNED'", target), "failed tenant posting rolls back");
            equal(2L, fixture.count("SELECT COUNT(*) FROM oa_asset_depreciation_schedule WHERE tenant_id=100091 AND status='POSTED'"), "failed tenant does not suppress other tenants");
            equal(2L, fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100091 AND audit_field='DEPRECIATION_POSTED' "
                    + "AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.job.executeNo'))=?", failedExecution), "successful items retain exact failed-job execution reference");
        } finally { fixture.jdbc.execute("DROP TRIGGER f1_job_owned_audit_failure"); }
        String retriedExecution = UUID.randomUUID().toString();
        JobResult retried = invoke(jobs, retriedExecution);
        equal("SUCCESS", retried.getExecuteStatus(), "retry reports actual success");
        equal(1, retried.getAffectedRows(), "retry reports only the previously failed period");
        equal(1L, fixture.count("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100090 AND audit_field='DEPRECIATION_POSTED' "
                + "AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.job.executeNo'))=? AND JSON_EXTRACT(after_json,'$.job.jobId')=1650", retriedExecution), "retried posting audit binds actual job and execution");
        List<Map<String, Object>> originalAudits = fixture.jdbc.queryForList("SELECT * FROM sys_audit_log WHERE tenant_id IN(100090,100091) AND audit_field='DEPRECIATION_POSTED' ORDER BY audit_id");
        equal(3, originalAudits.size(), "each actual posted item has one audit");
        JobResult repeated = invoke(jobs, UUID.randomUUID().toString());
        equal("SUCCESS", repeated.getExecuteStatus(), "completed scan returns success"); equal(0, repeated.getAffectedRows(), "completed scan reports zero new periods");
        equal(originalAudits, fixture.jdbc.queryForList("SELECT * FROM sys_audit_log WHERE tenant_id IN(100090,100091) AND audit_field='DEPRECIATION_POSTED' ORDER BY audit_id"), "completed scan preserves all original audits");
        equal(null, JobInvocationContext.execution(), "job execution context restored");
        identity(100000L, 1L);
        System.out.println("F1_ASSET_JOB: actualDatabase=true; actualTransactions=true; directoryDouble=true; selectedTenants=2; failurePropagated=true; otherTenantContinued=true; retryAffected=1; repeatAffected=0; executionAudit=true");
    }

    private static JobResult invoke(OaAssetProjectJobs jobs, String executeNo) {
        JobExecuteDTO request = new JobExecuteDTO(); request.setJobId(1650L); request.setExecuteNo(executeNo); request.setHandlerName("oaAssetDepreciationPost");
        try { return JobInvocationContext.callWithPlatformLock(request, jobs::oaAssetDepreciationPost); }
        catch (RuntimeException exception) { throw exception; }
        catch (Exception exception) { throw new IllegalStateException("Asset job check failed", exception); }
    }
}

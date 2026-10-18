package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.domain.SysJobLog;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.tenant.TenantContext;
import java.util.Objects;

record ImScheduledClaim(ImActors.Actor actor, JobInvocationContext.Execution execution, ImSyncSchedules.Command command) {
    static final String PREFIX = "IM_SYNC_RUN=";

    static ImScheduledClaim capture(ImMapper mapper, String parameter) {
        Long tenantId = TenantContext.getTenantId();
        JobInvocationContext.Execution execution = JobInvocationContext.execution();
        if (tenantId == null || tenantId <= 0 || TenantContext.getTenantSkip() || execution == null
                || execution.jobId() == null || execution.jobId() <= 0 || !ImSyncSchedules.HANDLER.equals(execution.handlerName())
                || execution.executeNo() == null || !execution.executeNo().matches("[a-zA-Z0-9-]{1,64}")) throw ImFailure.forbidden();
        ImSyncSchedules.Command command = ImSyncSchedules.command(parameter);
        ImConfigRow config = mapper.config(tenantId, command.configId());
        ImConfigRules.version(config, command.version());
        try {
            if (config.getUpdateBy() == null || !config.getUpdateBy().matches("[1-9][0-9]{0,18}")) throw ImFailure.forbidden();
            return new ImScheduledClaim(new ImActors.Actor(tenantId, Long.parseLong(config.getUpdateBy()), null), execution, command);
        } catch (NumberFormatException failure) { throw ImFailure.forbidden(); }
    }

    ImConfigRow verify(ImMapper mapper, ImActors actors, boolean locked) {
        actors.verifyRecorded(mapper, actor, "system:im:sync:preview", locked);
        actors.verifyRecorded(mapper, actor, "system:im:sync:run", locked);
        ImConfigRow config = locked ? mapper.lockConfig(actor.tenantId(), command.configId()) : mapper.config(actor.tenantId(), command.configId());
        ImConfigRules.version(config, command.version());
        if (!"WECOM".equals(config.getImType()) || !"ENABLED".equals(config.getStatus())
                || !Boolean.TRUE.equals(config.getSyncEnabled())) throw ImFailure.disabled();
        if (!Long.toString(actor.userId()).equals(config.getUpdateBy())) throw ImFailure.forbidden();
        SysJob job = mapper.scheduledJob(actor.tenantId(), execution.jobId());
        if (job == null || !ImSyncSchedules.shape(job) || !"ENABLED".equals(job.getStatus())
                || !Objects.equals(job.getCronExpression(), config.getSyncCron())
                || !command.equals(ImSyncSchedules.command(job.getHandlerParam()))) throw ImFailure.forbidden();
        log(mapper, locked);
        return config;
    }

    SysJobLog log(ImMapper mapper, boolean locked) {
        SysJobLog log = locked ? mapper.lockScheduledLog(actor.tenantId(), execution.jobId(), execution.executeNo())
                : mapper.scheduledLog(actor.tenantId(), execution.jobId(), execution.executeNo());
        if (log == null || !"RUNNING".equals(log.getExecuteStatus()) || !"CRON".equals(log.getTriggerType())) throw ImFailure.forbidden();
        return log;
    }

    ImSyncRunRow linked(ImMapper mapper, boolean locked) {
        String message = log(mapper, locked).getResultMsg();
        if (message == null) return null;
        if (!message.matches("IM_SYNC_RUN=[1-9][0-9]{0,18};.*")) throw ImFailure.orgLocal();
        long runId;
        try { runId = Long.parseLong(message.substring(PREFIX.length(), message.indexOf(';'))); }
        catch (NumberFormatException failure) { throw ImFailure.orgLocal(); }
        ImSyncRunRow row = mapper.syncRun(actor.tenantId(), runId);
        if (row == null || !Objects.equals(row.getConfigId(), command.configId()) || !Objects.equals(row.getConfigVersion(), command.version())
                || !Objects.equals(row.getRequestedBy(), actor.userId())) throw ImFailure.orgLocal();
        return row;
    }

    void link(ImMapper mapper, ImSyncRunRow row) {
        if (mapper.linkScheduledRun(actor.tenantId(), execution.jobId(), execution.executeNo(), reference(row.getSyncRunId())) != 1) throw ImFailure.conflict();
    }

    static String reference(long runId) { return PREFIX + runId + ";"; }
}

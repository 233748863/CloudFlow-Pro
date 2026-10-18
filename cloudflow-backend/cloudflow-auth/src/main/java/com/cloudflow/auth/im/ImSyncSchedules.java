package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.mapper.ImMapper;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

final class ImSyncSchedules {
    static final String HANDLER = "imOrganizationSync";
    private static final ObjectMapper JSON = JsonMapper.builder().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                    DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES, DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    private ImSyncSchedules() { }

    record Command(long configId, int version) { }

    static Command command(String value) {
        try {
            if (value == null || value.length() > 200) throw ImFailure.configuration();
            Command command = JSON.readValue(value, Command.class);
            if (command == null || command.configId() <= 0 || command.version() < 0) throw ImFailure.configuration();
            return command;
        } catch (JsonProcessingException failure) { throw ImFailure.configuration(); }
    }

    static void synchronize(ImMapper mapper, ImConfigRow config) {
        List<SysJob> jobs = mapper.scheduledJobs(config.getTenantId());
        if (jobs.size() > 1) throw ImFailure.orgLocal();
        if (jobs.isEmpty() && !Boolean.TRUE.equals(config.getSyncEnabled())) return;
        SysJob job = jobs.isEmpty() ? new SysJob() : jobs.get(0);
        if (job.getJobId() != null && (command(job.getHandlerParam()).configId() != config.getConfigId() || !shape(job))) throw ImFailure.orgLocal();
        try { job.setHandlerParam(JSON.writeValueAsString(new Command(config.getConfigId(), config.getVersion()))); }
        catch (JsonProcessingException failure) { throw ImFailure.configuration(); }
        job.setTenantId(config.getTenantId());
        job.setCronExpression(config.getSyncCron());
        job.setStatus(Boolean.TRUE.equals(config.getSyncEnabled()) && "ENABLED".equals(config.getStatus()) ? "ENABLED" : "PAUSED");
        job.setUpdateBy(config.getUpdateBy()); job.setUpdateTime(LocalDateTime.now());
        if (job.getJobId() == null) {
            job.setCreateBy(config.getCreateBy()); job.setCreateTime(job.getUpdateTime());
            if (mapper.insertScheduledJob(job) != 1 || job.getJobId() == null) throw ImFailure.persistence();
        } else if (mapper.updateScheduledJob(job) != 1) throw ImFailure.conflict();
    }

    static boolean shape(SysJob job) {
        return "auth".equals(job.getServiceName()) && HANDLER.equals(job.getHandlerName()) && "CRON".equals(job.getTriggerType())
                && Integer.valueOf(0).equals(job.getConcurrentFlag()) && "IGNORE".equals(job.getMisfireStrategy())
                && Integer.valueOf(0).equals(job.getRetryCount()) && Integer.valueOf(3).equals(job.getDispatchRetryCount())
                && Integer.valueOf(240).equals(job.getTimeoutSeconds()) && Integer.valueOf(300).equals(job.getLockTimeSeconds())
                && Integer.valueOf(1).equals(job.getLogSuccessFlag()) && Objects.equals(job.getAlarmOnFailFlag(), 1);
    }
}

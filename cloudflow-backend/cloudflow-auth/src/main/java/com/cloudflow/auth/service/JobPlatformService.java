package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.domain.SysJobHandler;
import com.cloudflow.auth.domain.SysJobLog;
import com.cloudflow.auth.domain.dto.CronValidateDTO;
import com.cloudflow.auth.domain.dto.JobLogCleanDTO;
import com.cloudflow.auth.domain.dto.JobLogQuery;
import com.cloudflow.auth.domain.dto.JobToggleDTO;
import com.cloudflow.auth.domain.dto.JobTriggerDTO;
import com.cloudflow.auth.domain.dto.SysJobDTO;
import com.cloudflow.auth.domain.vo.CronValidateVO;
import com.cloudflow.auth.domain.vo.JobTriggerResultVO;
import com.cloudflow.auth.domain.vo.SysJobHandlerVO;
import com.cloudflow.auth.domain.vo.SysJobLogVO;
import com.cloudflow.auth.domain.vo.SysJobVO;
import com.cloudflow.auth.mapper.SysJobHandlerMapper;
import com.cloudflow.auth.mapper.SysJobLogMapper;
import com.cloudflow.auth.mapper.SysJobMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.job.model.HandlerInfo;
import com.cloudflow.common.job.model.HandlerReportDTO;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobStatusVO;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import lombok.extern.slf4j.Slf4j;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * 定时任务平台核心服务。
 */
@Service
@Slf4j
public class JobPlatformService {
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SysJobMapper jobMapper;
    private final SysJobLogMapper logMapper;
    private final SysJobHandlerMapper handlerMapper;
    private final RedissonClient redissonClient;
    private final TaskScheduler scheduler;
    private final Executor dispatchExecutor;
    private final JobDispatchClient dispatchClient;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final MessageSender messageSender;
    private final SysAuditLogMapper auditLogMapper;
    private final Map<Long, ScheduledFuture<?>> futures = new HashMap<>();
    private final Map<Long, String> scheduleSignatures = new HashMap<>();
    private final AtomicBoolean scheduleReconciliationScheduled = new AtomicBoolean();
    private final AtomicLong nextMisfireDrainAt = new AtomicLong();
    private final AtomicBoolean shuttingDown = new AtomicBoolean();
    private volatile ScheduledFuture<?> reconciliationFuture;
    private static final String MISFIRE_QUEUE_KEY = "job:misfire:queue";
    private static final String MISFIRE_ONCE_MARKER_PREFIX = "job:misfire:once:";

    @Value("${cloudflow.job.handler-offline-threshold-seconds:180}")
    private long handlerOfflineThresholdSeconds;

    @Value("${cloudflow.job.alarm-escalation-threshold:3}")
    private int alarmEscalationThreshold;

    @Value("${spring.cloud.nacos.discovery.ip:${spring.cloud.client.ip-address:}}")
    private String instanceAddress;

    public JobPlatformService(SysJobMapper jobMapper, SysJobLogMapper logMapper,
                              SysJobHandlerMapper handlerMapper, RedissonClient redissonClient,
                              @Qualifier("jobTaskScheduler") TaskScheduler scheduler,
                              @Qualifier("jobDispatchExecutor") Executor dispatchExecutor,
                              JobDispatchClient dispatchClient,
                              StringRedisTemplate redisTemplate,
                              ObjectMapper objectMapper,
                              MessageSender messageSender,
                              SysAuditLogMapper auditLogMapper) {
        this.jobMapper = jobMapper;
        this.logMapper = logMapper;
        this.handlerMapper = handlerMapper;
        this.redissonClient = redissonClient;
        this.scheduler = scheduler;
        this.dispatchExecutor = dispatchExecutor;
        this.dispatchClient = dispatchClient;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.messageSender = messageSender;
        this.auditLogMapper = auditLogMapper;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void loadSchedules() {
        try {
            reconcileSchedules();
        } catch (TransientDataAccessException retryable) {
            log.warn("集中任务启动核对暂不可用，将在5秒后重试，异常类型={}", retryable.getClass().getSimpleName());
        }
        scheduleReconciliation();
    }

    @PreDestroy
    public void shutdownSchedules() {
        shuttingDown.set(true);
        ScheduledFuture<?> reconciliation = reconciliationFuture;
        if (reconciliation != null) reconciliation.cancel(false);
        synchronized (futures) {
            futures.values().forEach(future -> {
                if (future != null) future.cancel(false);
            });
            futures.clear();
            scheduleSignatures.clear();
        }
    }

    @Transactional(readOnly = true)
    public PageResult<SysJobVO> list(SysJob query, int pageNum, int pageSize) {
        LambdaQueryWrapper<SysJob> wrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysJob>()
                .eq(SysJob::getTenantId, tenantId()).eq(SysJob::getDeleted, 0)
                .like(query != null && StringUtils.hasText(query.getJobName()), SysJob::getJobName, query == null ? null : query.getJobName())
                .eq(query != null && StringUtils.hasText(query.getJobGroup()), SysJob::getJobGroup, query == null ? null : query.getJobGroup())
                .eq(query != null && StringUtils.hasText(query.getServiceName()), SysJob::getServiceName, query == null ? null : query.getServiceName())
                .eq(query != null && StringUtils.hasText(query.getStatus()), SysJob::getStatus, query == null ? null : query.getStatus())
                .eq(query != null && StringUtils.hasText(query.getTriggerType()), SysJob::getTriggerType, query == null ? null : query.getTriggerType())
                .orderByDesc(SysJob::getJobId);
        List<SysJobVO> rows = jobMapper.selectList(wrapper).stream().map(job -> {
            SysJobVO vo = new SysJobVO(); BeanUtils.copyProperties(job, vo); return vo;
        }).toList();
        return page(rows, pageNum, pageSize);
    }

    public SysJobVO get(Long jobId) {
        SysJob job = owned(jobId);
        SysJobVO vo = new SysJobVO(); BeanUtils.copyProperties(job, vo); return vo;
    }

    public List<SysJobHandlerVO> handlers(String serviceName) {
        markStaleHandlersOffline();
        String canonicalService = canonicalServiceName(serviceName);
        LambdaQueryWrapper<SysJobHandler> wrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysJobHandler>()
                .eq(StringUtils.hasText(canonicalService), SysJobHandler::getServiceName, canonicalService)
                .orderByAsc(SysJobHandler::getServiceName, SysJobHandler::getHandlerName);
        return handlerMapper.selectList(wrapper).stream().map(item -> {
            SysJobHandlerVO vo = new SysJobHandlerVO(); BeanUtils.copyProperties(item, vo); return vo;
        }).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public void add(SysJobDTO dto) {
        validate(dto);
        requireIndependentHandler(dto.getHandlerName());
        SysJob job = new SysJob(); copy(dto, job);
        job.setTenantId(tenantId()); job.setDeleted(0); job.setVersion(0);
        job.setCreateBy(userName()); job.setCreateTime(LocalDateTime.now());
        job.setUpdateBy(userName()); job.setUpdateTime(LocalDateTime.now());
        jobMapper.insert(job);
        runAfterCommit(() -> scheduleSafely(job));
    }

    @Transactional(rollbackFor = Exception.class)
    public void edit(SysJobDTO dto) {
        if (dto == null || dto.getJobId() == null) throw new ServiceException("任务ID不能为空");
        validate(dto);
        SysJob job = owned(dto.getJobId());
        requireIndependentHandler(job.getHandlerName());
        requireIndependentHandler(dto.getHandlerName());
        if (Integer.valueOf(1).equals(job.getCriticalFlag())
                && !"PAUSED".equals(job.getStatus()) && "PAUSED".equals(dto.getStatus())
                && !Boolean.TRUE.equals(dto.getConfirmCritical())) {
            throw new ServiceException("关键任务暂停需要二次确认");
        }
        String previousSchedule = scheduleSignature(job);
        copy(dto, job);
        job.setTenantId(tenantId()); job.setUpdateBy(userName()); job.setUpdateTime(LocalDateTime.now());
        jobMapper.updateById(job);
        if ("FIXED_DELAY".equals(job.getTriggerType()) && !previousSchedule.equals(scheduleSignature(job))) {
            updateFireTimes(job, null, "ENABLED".equals(job.getStatus())
                    ? calculateNextFireTime(job, LocalDateTime.now()) : null);
        }
        runAfterCommit(() -> {
            cancel(job.getJobId());
            if ("ENABLED".equals(job.getStatus())) scheduleSafely(job);
        });
    }

    @Transactional(rollbackFor = Exception.class)
    @HighRiskAction
    @Audit(name = "删除定时任务", highRisk = true)
    public void remove(List<Long> ids, Boolean confirmCritical) {
        if (ids == null) return;
        for (Long id : ids) {
            SysJob job = owned(id);
            requireIndependentHandler(job.getHandlerName());
            if (Integer.valueOf(1).equals(job.getCriticalFlag()) && !Boolean.TRUE.equals(confirmCritical)) {
                throw new ServiceException("关键任务删除需要二次确认");
            }
            // The logical-delete column is excluded from entity updates; persist it explicitly.
            LambdaUpdateWrapper<SysJob> deletion = new LambdaUpdateWrapper<SysJob>()
                    .eq(SysJob::getJobId, id).eq(SysJob::getTenantId, tenantId())
                    .eq(SysJob::getDeleted, 0).eq(SysJob::getVersion, job.getVersion())
                    .set(SysJob::getDeleted, 1).set(SysJob::getStatus, "PAUSED")
                    .set(SysJob::getUpdateBy, userName()).set(SysJob::getUpdateTime, LocalDateTime.now())
                    .set(SysJob::getVersion, job.getVersion() + 1);
            if (jobMapper.update(null, deletion) != 1) throw new ServiceException("任务已变化，请重新读取后删除", 409);
            recordJobAudit("删除定时任务", "job:" + id, job.getStatus(), "DELETED");
        }
        runAfterCommit(() -> ids.forEach(this::cancel));
    }

    @HighRiskAction
    @Audit(name = "手动触发定时任务", highRisk = true)
    public JobTriggerResultVO trigger(Long jobId, JobTriggerDTO dto) {
        SysJob job = owned(jobId);
        requireIndependentHandler(job.getHandlerName());
        recordJobAudit("手动触发定时任务", "job:" + jobId, job.getStatus(), "TRIGGER_REQUESTED");
        return dispatch(job, dto == null ? null : dto.getHandlerParam(), "MANUAL", userName(), 0);
    }

    @Transactional(rollbackFor = Exception.class)
    @HighRiskAction
    @Audit(name = "启停定时任务", highRisk = true)
    public void toggle(Long jobId, JobToggleDTO dto) {
        SysJob job = owned(jobId);
        requireIndependentHandler(job.getHandlerName());
        if (dto == null) throw new ServiceException("任务状态不能为空");
        if (Integer.valueOf(1).equals(job.getCriticalFlag()) && !Boolean.TRUE.equals(dto.getConfirmCritical())) {
            throw new ServiceException("关键任务启停需要二次确认");
        }
        if (!"ENABLED".equals(dto.getStatus()) && !"PAUSED".equals(dto.getStatus())) throw new ServiceException("任务状态不合法");
        recordJobAudit("启停定时任务", "job:" + jobId, job.getStatus(), dto.getStatus());
        job.setStatus(dto.getStatus()); job.setUpdateBy(userName()); job.setUpdateTime(LocalDateTime.now()); jobMapper.updateById(job);
        if ("PAUSED".equals(dto.getStatus())) {
            jobMapper.update(null, new LambdaUpdateWrapper<SysJob>()
                    .eq(SysJob::getJobId, jobId)
                    .set(SysJob::getNextFireTime, null));
        }
        runAfterCommit(() -> {
            cancel(jobId);
            if ("ENABLED".equals(dto.getStatus())) scheduleSafely(job);
        });
    }

    private static void requireIndependentHandler(String handlerName) {
        if (handlerName != null && "imOrganizationSync".equalsIgnoreCase(handlerName.trim())) {
            throw new ServiceException("企业微信定时同步须从企业通信配置维护；立即同步请使用组织同步页面", 403);
        }
    }

    public CronValidateVO validateCron(CronValidateDTO dto) {
        if (dto == null) return new CronValidateVO(false, "请求不能为空", List.of());
        if ("FIXED_RATE".equals(dto.getTriggerType()) || "FIXED_DELAY".equals(dto.getTriggerType())) {
            boolean valid = dto.getIntervalMs() != null && dto.getIntervalMs() > 0;
            return new CronValidateVO(valid, valid ? "合法" : "固定间隔必须大于0", List.of());
        }
        try {
            CronExpression expression = CronExpression.parse(dto.getCronExpression());
            LocalDateTime next = LocalDateTime.now(); List<String> times = new ArrayList<>();
            for (int i = 0; i < 5; i++) { next = expression.next(next); if (next == null) break; times.add(next.format(DATE_TIME)); }
            return new CronValidateVO(true, "合法", times);
        } catch (Exception e) { return new CronValidateVO(false, "CRON 表达式不合法", List.of()); }
    }

    public PageResult<SysJobLogVO> logs(JobLogQuery query, int pageNum, int pageSize) {
        LocalDateTime beginTime = parseDateTime(query == null ? null : query.getBeginTime(), false);
        LocalDateTime endTime = parseDateTime(query == null ? null : query.getEndTime(), true);
        LambdaQueryWrapper<SysJobLog> wrapper = new LambdaQueryWrapper<SysJobLog>()
                .eq(SysJobLog::getTenantId, tenantId())
                .eq(query != null && query.getJobId() != null, SysJobLog::getJobId, query == null ? null : query.getJobId())
                .eq(query != null && StringUtils.hasText(query.getHandlerName()), SysJobLog::getHandlerName, query == null ? null : query.getHandlerName())
                .eq(query != null && StringUtils.hasText(query.getExecuteStatus()), SysJobLog::getExecuteStatus, query == null ? null : query.getExecuteStatus())
                .ge(beginTime != null, SysJobLog::getStartTime, beginTime)
                .le(endTime != null, SysJobLog::getStartTime, endTime)
                .orderByDesc(SysJobLog::getStartTime);
        int p = Math.max(1, pageNum);
        int s = Math.max(1, Math.min(200, pageSize));
        Page<SysJobLog> page = logMapper.selectPage(new Page<>(p, s), wrapper);
        List<SysJobLogVO> rows = page.getRecords().stream().map(item -> {
            SysJobLogVO vo = new SysJobLogVO();
            BeanUtils.copyProperties(item, vo);
            return vo;
        }).toList();
        return new PageResult<>(rows, page.getTotal(), page.getCurrent(), page.getSize());
    }

    public SysJobLogVO log(Long logId) {
        SysJobLog row = logMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysJobLog>()
                .eq(SysJobLog::getLogId, logId).eq(SysJobLog::getTenantId, tenantId()));
        if (row == null) throw new ServiceException("任务日志不存在", 404);
        SysJobLogVO vo = new SysJobLogVO(); BeanUtils.copyProperties(row, vo); return vo;
    }

    @Transactional(rollbackFor = Exception.class)
    @HighRiskAction
    @Audit(name = "清理定时任务日志", highRisk = true)
    public int cleanLogs(JobLogCleanDTO dto) {
        if (dto != null && dto.getBeforeDate() == null && dto.getKeepDays() != null
                && dto.getKeepDays() <= 0) {
            throw new ServiceException("日志保留天数必须大于0");
        }
        LocalDateTime before = dto != null && dto.getBeforeDate() != null
                ? dto.getBeforeDate().atStartOfDay() : LocalDateTime.now().minusDays(dto == null || dto.getKeepDays() == null ? 30 : dto.getKeepDays());
        recordJobAudit("清理定时任务日志", "before", null, before.format(DATE_TIME));
        return logMapper.deleteBefore(tenantId(), before);
    }

    @Transactional(rollbackFor = Exception.class)
    public void reportHandlers(HandlerReportDTO dto, String sourceService) {
        if (dto == null || !StringUtils.hasText(dto.getServiceName())) throw new ServiceException("服务名不能为空");
        String serviceName = canonicalServiceName(dto.getServiceName());
        if (!serviceName.equals(canonicalServiceName(sourceService))) {
            throw new ServiceException("Handler 上报来源服务不匹配", 403);
        }
        LocalDateTime now = LocalDateTime.now();
        Set<String> reported = new java.util.HashSet<>();
        for (HandlerInfo info : dto.getHandlers() == null ? List.<HandlerInfo>of() : dto.getHandlers()) {
            if (info == null || !StringUtils.hasText(info.getHandlerName())) continue;
            reported.add(info.getHandlerName());
            handlerMapper.upsert(serviceName, info.getHandlerName(), info.getHandlerDesc(), now);
        }
        List<SysJobHandler> existing = handlerMapper.selectList(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysJobHandler>().eq(SysJobHandler::getServiceName, serviceName));
        for (SysJobHandler row : existing) if (!reported.contains(row.getHandlerName())) { row.setStatus("OFFLINE"); row.setUpdateTime(now); handlerMapper.updateById(row); }
    }

    @Transactional(rollbackFor = Exception.class)
    public void reportResult(JobResultReportDTO dto, String sourceService) {
        if (dto == null || !StringUtils.hasText(dto.getExecuteNo())) throw new ServiceException("执行编号不能为空");
        SysJobLog row = logMapper.selectOne(new LambdaQueryWrapper<SysJobLog>()
                .eq(SysJobLog::getExecuteNo, dto.getExecuteNo()));
        if (row == null || !"RUNNING".equals(row.getExecuteStatus())) return;
        if ("RUNNING".equals(dto.getExecuteStatus())) return;
        SysJob job = jobMapper.selectIncludingDeleted(row.getJobId());
        if (job != null && !canonicalServiceName(job.getServiceName()).equals(canonicalServiceName(sourceService))) {
            throw new ServiceException("任务结果上报来源服务不匹配", 403);
        }
        String status = normalizeResultStatus(dto.getExecuteStatus());
        LocalDateTime completedAt = LocalDateTime.now();
        if (completeIfRunning(row, status, dto.getAffectedRows(), dto.getResultMsg(),
                dto.getExceptionStack(), dto.getExecutorIp(), dto.getDurationMs(), completedAt)) {
            handleTerminalResult(job, row, status);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public JobExecuteDTO registerBusinessJob(BusinessJobStartRequest request, String sourceService) {
        String source = canonicalServiceName(sourceService);
        boolean hrHandler = "hr".equals(source) && request != null
                && request.getHandlerName() != null
                && Set.of("hrAttendanceRecalcAsync", "hrPayrollBatchCalculate").contains(request.getHandlerName());
        boolean importHandler = Set.of("auth", "hr", "oa", "crm").contains(source) && request != null
                && "batchImport".equals(request.getHandlerName());
        if ((!hrHandler && !importHandler) || request == null
                || request.getHandlerName() == null
                || UserContext.getTenantId() == null) throw new ServiceException("业务任务登记来源或处理器不合法", 403);
        try { UUID.fromString(request.getExecuteNo()); }
        catch (RuntimeException exception) { throw new ServiceException("执行编号不合法"); }
        if (request.getHandlerParam() == null || request.getHandlerParam().length() > 60000) throw new ServiceException("业务任务参数不合法");
        List<SysJob> businessJobs = findBusinessJobs(source, request.getHandlerName(), false);
        if (businessJobs.isEmpty() && importHandler) {
            businessJobs = initializeImportBusinessJob(source);
        }
        // Business calls supply their own scope; use the generic seeded configuration, not a parameterized schedule.
        if (businessJobs.isEmpty()) throw new ServiceException("当前租户尚未配置该业务任务的无固定参数配置");
        if (businessJobs.size() != 1) throw new ServiceException("该业务任务存在多份无固定参数配置，请管理员核定", 409);
        SysJob job = businessJobs.get(0);
        SysJobLog existing = logMapper.selectOne(new LambdaQueryWrapper<SysJobLog>()
                .eq(SysJobLog::getTenantId, tenantId()).eq(SysJobLog::getExecuteNo, request.getExecuteNo()));
        if (existing != null) throw new ServiceException("业务任务执行编号已使用");
        SysJobLog entry = new SysJobLog();
        entry.setTenantId(tenantId());
        entry.setJobId(job.getJobId());
        entry.setJobName(job.getJobName());
        entry.setHandlerName(job.getHandlerName());
        entry.setExecuteNo(request.getExecuteNo());
        entry.setTriggerType("MANUAL");
        entry.setTriggerBy(StringUtils.hasText(request.getOperatorName()) ? request.getOperatorName() : source + "-business");
        entry.setStartTime(LocalDateTime.now());
        entry.setCreateTime(LocalDateTime.now());
        entry.setExecuteStatus("RUNNING");
        entry.setDispatcherIp(localAddress());
        entry.setDispatchRetryIndex(0);
        entry.setRetryIndex(job.getRetryCount() == null ? 0 : job.getRetryCount());
        logMapper.insert(entry);
        JobExecuteDTO execution = new JobExecuteDTO();
        execution.setJobId(job.getJobId());
        execution.setJobLogId(entry.getLogId());
        execution.setExecuteNo(request.getExecuteNo());
        execution.setHandlerName(request.getHandlerName());
        execution.setHandlerParam(request.getHandlerParam());
        execution.setTimeoutSeconds(job.getTimeoutSeconds());
        execution.setLockTimeSeconds(job.getLockTimeSeconds());
        execution.setConcurrentFlag(job.getConcurrentFlag());
        return execution;
    }

    private List<SysJob> findBusinessJobs(String source, String handlerName, boolean lock) {
        LambdaQueryWrapper<SysJob> query = new LambdaQueryWrapper<SysJob>()
                .eq(SysJob::getTenantId, tenantId()).eq(SysJob::getDeleted, 0)
                .eq(SysJob::getHandlerName, handlerName)
                .in(SysJob::getServiceName, source, "auth".equals(source) ? "cloudflow-auth" : "cloudflow-service-" + source);
        if (lock) query.last("FOR UPDATE");
        return jobMapper.selectList(query).stream()
                .filter(configured -> !StringUtils.hasText(configured.getHandlerParam())).toList();
    }

    private List<SysJob> initializeImportBusinessJob(String source) {
        // Serialize first use across service instances; the locking read also avoids stale RR snapshots.
        if (jobMapper.lockActiveImportTenant(tenantId()) == null) {
            throw new ServiceException("租户不存在、已停用或已到期，不能初始化导入任务", 403);
        }
        List<SysJob> configured = findBusinessJobs(source, "batchImport", true);
        if (!configured.isEmpty()) return configured;
        SysJob job = new SysJob();
        job.setTenantId(tenantId());
        job.setJobName(switch (source) {
            case "auth" -> "节假日批量导入";
            case "hr" -> "员工批量导入";
            case "oa" -> "资产及供应商批量导入";
            case "crm" -> "客户批量导入";
            default -> throw new ServiceException("导入来源服务不合法", 403);
        });
        job.setJobGroup("auth".equals(source) ? "SYSTEM" : source.toUpperCase(java.util.Locale.ROOT));
        job.setServiceName(source);
        job.setHandlerName("batchImport");
        job.setTriggerType("CRON");
        job.setCronExpression("0 0 0 1 1 ?");
        job.setStatus("PAUSED");
        job.setConcurrentFlag(1);
        job.setMisfireStrategy("IGNORE");
        job.setRetryCount(0);
        job.setTimeoutSeconds(600);
        job.setLockTimeSeconds(600);
        job.setAlarmOnFailFlag(1);
        job.setDeleted(0);
        job.setVersion(0);
        job.setCreateBy("system:batchImport");
        job.setCreateTime(LocalDateTime.now());
        job.setRemark("首次导入自动初始化，仅供业务手动触发");
        if (jobMapper.insert(job) != 1) throw new ServiceException("导入任务配置初始化失败");
        return List.of(job);
    }

    private void schedule(SysJob job) {
        synchronized (futures) {
            SysJob current = TenantBroker.applyWithoutTenant(ignored -> jobMapper.selectById(job.getJobId()));
            if (current == null) {
                cancel(job.getJobId());
                return;
            }
            TenantBroker.runAs(current.getTenantId(), ignored -> registerSchedule(current));
        }
    }

    private void registerSchedule(SysJob job) {
        cancel(job.getJobId());
        if (shuttingDown.get() || !"ENABLED".equals(job.getStatus())) return;
        ScheduledFuture<?> future;
        String type = job.getTriggerType() == null ? "CRON" : job.getTriggerType();
        long intervalMs = Math.max(1L, job.getIntervalMs() == null ? 60000L : job.getIntervalMs());
        long nowMs = System.currentTimeMillis();
        if ("FIXED_RATE".equals(type)) {
            long firstFire = Math.addExact(nowMs - Math.floorMod(nowMs, intervalMs), intervalMs);
            AtomicLong nextFire = new AtomicLong(firstFire);
            future = scheduler.scheduleAtFixedRate(
                    () -> submitScheduledDispatch(job.getJobId(), Instant.ofEpochMilli(nextFire.getAndAdd(intervalMs))),
                    Instant.ofEpochMilli(firstFire), Duration.ofMillis(intervalMs));
        } else if ("FIXED_DELAY".equals(type)) {
            future = scheduler.scheduleWithFixedDelay(
                    () -> submitScheduledDispatch(job.getJobId(), null), Instant.now(),
                    Duration.ofMillis(Math.min(1000L, intervalMs)));
        } else {
            CronTrigger trigger = new CronTrigger(job.getCronExpression());
            AtomicReference<Instant> nextFire = new AtomicReference<>();
            future = scheduler.schedule(() -> submitScheduledDispatch(job.getJobId(), nextFire.get()), context -> {
                Instant next = trigger.nextExecution(context);
                nextFire.set(next);
                return next;
            });
        }
        synchronized (futures) {
            futures.put(job.getJobId(), future);
            scheduleSignatures.put(job.getJobId(), scheduleSignature(job));
        }
        if (!"FIXED_DELAY".equals(type)) {
            updateFireTimes(job, null, calculateNextFireTime(job, LocalDateTime.now()));
        }
    }

    private void scheduleSafely(SysJob job) {
        try {
            schedule(job);
        } catch (RuntimeException e) {
            log.error("定时任务注册失败, jobId={}, handler={}", job.getJobId(), job.getHandlerName(), e);
        }
    }

    private void cancel(Long jobId) {
        synchronized (futures) {
            ScheduledFuture<?> future = futures.remove(jobId);
            scheduleSignatures.remove(jobId);
            if (future != null) future.cancel(false);
        }
    }

    private void submitScheduledDispatch(Long jobId, Instant scheduledFireTime) {
        if (shuttingDown.get()) return;
        try {
            dispatchExecutor.execute(() -> {
                try {
                    SysJob current = jobMapper.selectById(jobId);
                    if (current != null && "ENABLED".equals(current.getStatus())
                            && Integer.valueOf(0).equals(current.getDeleted())) {
                        dispatch(current, null, "CRON", null, 0, true, scheduledFireTime);
                    }
                } catch (Throwable e) {
                    // 周期 Runnable 不得向调度器抛异常，否则 ScheduledFuture 会被永久取消。
                    log.error("定时任务调度异常, jobId={}", jobId, e);
                }
            });
        } catch (RuntimeException e) {
            log.error("任务调度线程池繁忙, jobId={}", jobId, e);
        }
    }

    private JobTriggerResultVO dispatch(SysJob job, String overrideParam, String triggerType, String triggerBy) {
        return dispatch(job, overrideParam, triggerType, triggerBy, 0);
    }

    private JobTriggerResultVO dispatch(SysJob job, String overrideParam, String triggerType,
                                       String triggerBy, int retryIndex) {
        return dispatch(job, overrideParam, triggerType, triggerBy, retryIndex, true);
    }

    private JobTriggerResultVO dispatch(SysJob job, String overrideParam, String triggerType,
                                        String triggerBy, int retryIndex, boolean enqueueOnFailure) {
        return dispatch(job, overrideParam, triggerType, triggerBy, retryIndex, enqueueOnFailure, null);
    }

    private JobTriggerResultVO dispatch(SysJob job, String overrideParam, String triggerType,
                                       String triggerBy, int retryIndex, boolean enqueueOnFailure,
                                       Instant scheduledFireTime) {
        if (job.getTenantId() != null) {
            return TenantBroker.applyAs(job.getTenantId(), ignored ->
                    dispatchInternal(job, overrideParam, triggerType, triggerBy, retryIndex,
                            enqueueOnFailure, scheduledFireTime));
        }
        throw new ServiceException("定时任务缺少租户ID");
    }

    private JobTriggerResultVO dispatchInternal(SysJob job, String overrideParam, String triggerType,
                                                 String triggerBy, int retryIndex, boolean enqueueOnFailure,
                                                 Instant scheduledFireTime) {
        String executeNo = UUID.randomUUID().toString();
        long interval = job.getIntervalMs() == null ? 60000L : Math.max(1L, job.getIntervalMs());
        boolean scheduled = "CRON".equalsIgnoreCase(triggerType);
        boolean fixedDelay = scheduled && "FIXED_DELAY".equals(job.getTriggerType());
        String lockWindow = fixedDelay ? "FIXED_DELAY" : scheduled
                ? String.valueOf((scheduledFireTime == null ? Instant.now() : scheduledFireTime).toEpochMilli())
                : executeNo;
        RLock lock = redissonClient.getLock("cloudflow:job:dispatch:" + job.getJobId() + ":" + lockWindow);
        SysJobLog executionLog = null;
        try {
            if (!lock.tryLock(0, Math.max(1, job.getLockTimeSeconds() == null ? 300 : job.getLockTimeSeconds()), TimeUnit.SECONDS)) {
                return new JobTriggerResultVO(executeNo, false, "LOCK_HELD");
            }
            if (fixedDelay) {
                SysJob current = jobMapper.selectById(job.getJobId());
                if (current == null || !"ENABLED".equals(current.getStatus())
                        || !Integer.valueOf(0).equals(current.getDeleted())) {
                    return new JobTriggerResultVO(executeNo, false, "PAUSED");
                }
                if (current.getNextFireTime() != null && current.getNextFireTime().isAfter(LocalDateTime.now())) {
                    return new JobTriggerResultVO(executeNo, false, "WAITING_INTERVAL");
                }
                if (logMapper.selectCount(new LambdaQueryWrapper<SysJobLog>()
                        .eq(SysJobLog::getJobId, job.getJobId())
                        .eq(SysJobLog::getExecuteStatus, "RUNNING")) > 0) {
                    return new JobTriggerResultVO(executeNo, false, "RUNNING");
                }
            }
            if (scheduled && !fixedDelay
                    && !claimFireWindow(job.getJobId(), lockWindow, executeNo, interval)) {
                return new JobTriggerResultVO(executeNo, false, "DUPLICATE_WINDOW");
            }
            executionLog = new SysJobLog();
            executionLog.setTenantId(job.getTenantId()); executionLog.setJobId(job.getJobId()); executionLog.setJobName(job.getJobName());
            executionLog.setHandlerName(job.getHandlerName()); executionLog.setExecuteNo(executeNo); executionLog.setTriggerType(triggerType); executionLog.setTriggerBy(triggerBy);
            executionLog.setStartTime(LocalDateTime.now()); executionLog.setExecuteStatus("RUNNING");
            executionLog.setDispatcherIp(localAddress()); executionLog.setDispatchRetryIndex(0);
            executionLog.setRetryIndex(Math.max(0, retryIndex)); executionLog.setCreateTime(LocalDateTime.now());
            logMapper.insert(executionLog);
            if (fixedDelay) updateFireTimes(job, null, null);
            JobExecuteDTO request = new JobExecuteDTO();
            request.setJobId(job.getJobId()); request.setExecuteNo(executeNo); request.setHandlerName(job.getHandlerName());
            request.setHandlerParam(overrideParam == null ? job.getHandlerParam() : overrideParam);
            request.setTimeoutSeconds(job.getTimeoutSeconds()); request.setLockTimeSeconds(job.getLockTimeSeconds());
            request.setConcurrentFlag(job.getConcurrentFlag());
            int attempts = Math.max(0, job.getDispatchRetryCount() == null ? 3 : job.getDispatchRetryCount());
            for (int attempt = 0; attempt <= attempts; attempt++) {
                executionLog.setDispatchRetryIndex(attempt);
                R<JobAcceptVO> result;
                try {
                    result = dispatchClient.execute(job, request, String.valueOf(job.getTenantId()));
                } catch (Exception e) {
                    if (attempt < attempts) {
                        waitRetry(job.getDispatchRetryIntervalSec());
                        continue;
                    }
                    boolean marked = markDispatchFailed(job, executionLog, e.getMessage());
                    if (marked && enqueueOnFailure) enqueueMisfire(job, request, triggerType, retryIndex);
                    return new JobTriggerResultVO(executeNo, false, "DISPATCH_FAILED");
                }
                if (result != null && result.isSuccess() && result.getData() != null && result.getData().isAccepted()) {
                    updateDispatchRetryIndex(executionLog.getLogId(), attempt);
                    LocalDateTime firedAt = LocalDateTime.now();
                    if ("FIXED_DELAY".equals(job.getTriggerType())) {
                        jobMapper.update(null, new LambdaUpdateWrapper<SysJob>()
                                .eq(SysJob::getJobId, job.getJobId())
                                .set(SysJob::getLastFireTime, firedAt));
                    } else {
                        updateFireTimes(job, firedAt, calculateNextFireTime(job, firedAt));
                    }
                    return new JobTriggerResultVO(executeNo, true, null);
                }
                String reason = result == null || result.getData() == null ? "网络调度失败" : result.getData().getReason();
                if ("LOCK_HELD".equals(reason)) {
                    markSkippedIfRunning(job, executionLog, reason);
                    return new JobTriggerResultVO(executeNo, false, "SKIPPED");
                }
                if (attempt < attempts) {
                    waitRetry(job.getDispatchRetryIntervalSec());
                    continue;
                }
                boolean marked = markDispatchFailed(job, executionLog, reason);
                if (marked && enqueueOnFailure) enqueueMisfire(job, request, triggerType, retryIndex);
                return new JobTriggerResultVO(executeNo, false, "DISPATCH_FAILED");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (executionLog != null) markDispatchFailed(job, executionLog, "调度线程被中断");
            return new JobTriggerResultVO(executeNo, false, "INTERRUPTED");
        } catch (RuntimeException e) {
            if (executionLog != null) markDispatchFailed(job, executionLog, e.getMessage());
            throw e;
        } finally {
            try {
                if (lock.isHeldByCurrentThread()) lock.unlock();
            } catch (RuntimeException e) {
                log.warn("释放任务调度锁失败, jobId={}, executeNo={}", job.getJobId(), executeNo);
            }
        }
        return new JobTriggerResultVO(executeNo, false, "DISPATCH_FAILED");
    }

    private boolean claimFireWindow(Long jobId, String fireWindow, String executeNo, long intervalMs) {
        long ttlMs;
        try {
            ttlMs = Math.max(120000L, Math.multiplyExact(intervalMs, 2L));
        } catch (ArithmeticException ignored) {
            ttlMs = Duration.ofDays(7).toMillis();
        }
        ttlMs = Math.min(ttlMs, Duration.ofDays(7).toMillis());
        Boolean claimed = redisTemplate.opsForValue().setIfAbsent(
                "cloudflow:job:dispatch-fired:" + jobId + ":" + fireWindow,
                executeNo, Duration.ofMillis(ttlMs));
        return Boolean.TRUE.equals(claimed);
    }

    private boolean markDispatchFailed(SysJob job, SysJobLog executionLog, String detail) {
        LocalDateTime now = LocalDateTime.now();
        int updated = logMapper.update(null, new LambdaUpdateWrapper<SysJobLog>()
                .eq(SysJobLog::getExecuteNo, executionLog.getExecuteNo())
                .eq(SysJobLog::getExecuteStatus, "RUNNING")
                .set(SysJobLog::getExecuteStatus, "DISPATCH_FAILED")
                .set(SysJobLog::getResultMsg, "网络调度失败")
                .set(SysJobLog::getExceptionStack, detail)
                .set(SysJobLog::getDispatchRetryIndex, executionLog.getDispatchRetryIndex())
                .set(SysJobLog::getEndTime, now));
        if (updated > 0) {
            scheduleAfterCompletion(job, executionLog, now);
            alarm(job, "网络调度失败", executionLog.getExecuteNo(), detail);
            return true;
        }
        return false;
    }

    private void waitRetry(Integer seconds) throws InterruptedException {
        long delay = Math.max(1, seconds == null ? 10 : seconds);
        TimeUnit.SECONDS.sleep(delay);
    }

    private void markSkippedIfRunning(SysJob job, SysJobLog executionLog, String reason) {
        LocalDateTime now = LocalDateTime.now();
        int updated = logMapper.update(null, new LambdaUpdateWrapper<SysJobLog>()
                .eq(SysJobLog::getExecuteNo, executionLog.getExecuteNo())
                .eq(SysJobLog::getExecuteStatus, "RUNNING")
                .set(SysJobLog::getExecuteStatus, "SKIPPED")
                .set(SysJobLog::getResultMsg, reason)
                .set(SysJobLog::getDispatchRetryIndex, executionLog.getDispatchRetryIndex())
                .set(SysJobLog::getEndTime, now));
        if (updated > 0) scheduleAfterCompletion(job, executionLog, now);
    }

    private void updateDispatchRetryIndex(Long logId, int retryIndex) {
        if (logId == null || retryIndex <= 0) return;
        logMapper.update(null, new LambdaUpdateWrapper<SysJobLog>()
                .eq(SysJobLog::getLogId, logId)
                .set(SysJobLog::getDispatchRetryIndex, retryIndex));
    }

    /**
     * 每个 auth 实例周期核对数据库，使另一个实例上的配置变更也能在 10 秒内生效。
     */
    private void reconcileSchedules() {
        synchronized (futures) {
            reconcileSchedulesInternal();
        }
    }

    private void reconcileSchedulesInternal() {
        List<SysJob> enabledJobs;
        try {
            enabledJobs = TenantBroker.applyWithoutTenant(ignored -> jobMapper.selectList(new LambdaQueryWrapper<SysJob>()
                    .eq(SysJob::getStatus, "ENABLED")
                    .eq(SysJob::getDeleted, 0)));
        } catch (RuntimeException e) {
            log.error("读取集中任务配置失败", e);
            return;
        }
        Set<Long> enabledIds = new java.util.HashSet<>();
        for (SysJob job : enabledJobs) {
            enabledIds.add(job.getJobId());
            if (!isSupportedService(job.getServiceName())) {
                cancel(job.getJobId());
                continue;
            }
            boolean changed;
            synchronized (futures) {
                ScheduledFuture<?> future = futures.get(job.getJobId());
                changed = future == null || future.isCancelled() || future.isDone()
                        || !scheduleSignature(job).equals(scheduleSignatures.get(job.getJobId()));
            }
            if (changed) scheduleSafely(job);
        }
        List<Long> staleIds;
        synchronized (futures) {
            staleIds = futures.keySet().stream().filter(id -> !enabledIds.contains(id)).toList();
        }
        staleIds.forEach(this::cancel);
        markStaleHandlersOffline();
        submitMisfireDrain();
    }

    private void scheduleReconciliation() {
        if (shuttingDown.get()) return;
        if (!scheduleReconciliationScheduled.compareAndSet(false, true)) return;
        reconciliationFuture = scheduler.schedule(() -> {
            try {
                reconcileSchedules();
            } catch (Throwable e) {
                log.error("集中任务配置核对异常", e);
            } finally {
                scheduleReconciliationScheduled.set(false);
                scheduleReconciliation();
            }
        }, java.time.Instant.now().plusSeconds(5));
    }

    private String scheduleSignature(SysJob job) {
        return String.join("|",
                value(job.getTriggerType()), value(job.getCronExpression()), value(job.getIntervalMs()),
                value(job.getStatus()), value("imOrganizationSync".equals(job.getHandlerName()) ? job.getHandlerParam() : null));
    }

    private String value(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private LocalDateTime calculateNextFireTime(SysJob job, LocalDateTime from) {
        try {
            String type = job.getTriggerType() == null ? "CRON" : job.getTriggerType();
            if ("FIXED_RATE".equals(type) || "FIXED_DELAY".equals(type)) {
                long intervalMs = Math.max(1L, job.getIntervalMs() == null ? 60000L : job.getIntervalMs());
                if ("FIXED_RATE".equals(type)) {
                    long epochMs = from.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
                    long nextMs = Math.addExact(epochMs - Math.floorMod(epochMs, intervalMs), intervalMs);
                    return LocalDateTime.ofInstant(Instant.ofEpochMilli(nextMs), java.time.ZoneId.systemDefault());
                }
                return from.plus(Duration.ofMillis(intervalMs));
            }
            return CronExpression.parse(job.getCronExpression()).next(from);
        } catch (RuntimeException e) {
            log.warn("计算任务下次触发时间失败, jobId={}", job.getJobId());
            return null;
        }
    }

    private void updateFireTimes(SysJob job, LocalDateTime lastFireTime, LocalDateTime nextFireTime) {
        LambdaUpdateWrapper<SysJob> update = new LambdaUpdateWrapper<SysJob>()
                .eq(SysJob::getJobId, job.getJobId());
        if (lastFireTime != null) update.set(SysJob::getLastFireTime, lastFireTime);
        update.set(SysJob::getNextFireTime, nextFireTime);
        jobMapper.update(null, update);
    }

    private void markStaleHandlersOffline() {
        long seconds = Math.max(30L, handlerOfflineThresholdSeconds);
        handlerMapper.update(null, new LambdaUpdateWrapper<SysJobHandler>()
                .eq(SysJobHandler::getStatus, "ONLINE")
                .lt(SysJobHandler::getLastReportTime, LocalDateTime.now().minusSeconds(seconds))
                .set(SysJobHandler::getStatus, "OFFLINE")
                .set(SysJobHandler::getUpdateBy, "system-heartbeat")
                .set(SysJobHandler::getUpdateTime, LocalDateTime.now()));
    }

    /** 扫描回报丢失的执行记录；先反查业务服务，反查失败才标记 TIMEOUT。 */
    public void inspectTimeouts() {
        LocalDateTime now = LocalDateTime.now();
        List<SysJobLog> rows = TenantBroker.applyWithoutTenant(ignored -> logMapper.selectList(new LambdaQueryWrapper<SysJobLog>()
                .eq(SysJobLog::getExecuteStatus, "RUNNING")
                .lt(SysJobLog::getStartTime, now.minusSeconds(1))));
        for (SysJobLog row : rows) {
            try {
                TenantBroker.runAs(row.getTenantId(), ignored -> inspectTimeout(row, now));
            } catch (RuntimeException e) {
                log.error("任务结果巡检异常, executeNo={}", row.getExecuteNo(), e);
            }
        }
    }

    private void inspectTimeout(SysJobLog row, LocalDateTime now) {
        SysJob job = jobMapper.selectIncludingDeleted(row.getJobId());
        int timeoutSeconds = job == null || job.getTimeoutSeconds() == null
                ? 1800 : Math.max(1, job.getTimeoutSeconds());
        if (row.getStartTime() == null || row.getStartTime().plusSeconds(timeoutSeconds).isAfter(now)) {
            return;
        }
        if (job != null) {
            try {
                R<JobStatusVO> response = dispatchClient.status(
                        job, row.getExecuteNo(), String.valueOf(row.getTenantId()));
                if (response != null && response.isSuccess() && response.getData() != null) {
                    JobStatusVO value = response.getData();
                    if ("RUNNING".equals(value.getExecuteStatus())) {
                        // 任务仍在执行时保持 RUNNING，等状态缓存到期后再次巡检。
                        return;
                    }
                    if (StringUtils.hasText(value.getExecuteStatus())) {
                        String actualStatus = normalizeResultStatus(value.getExecuteStatus());
                        if (completeIfRunning(row, actualStatus, value.getAffectedRows(), value.getResultMsg(),
                                value.getExceptionStack(), null, value.getDurationMs(), now)) {
                            handleTerminalResult(job, row, actualStatus);
                        }
                        return;
                    }
                }
            } catch (RuntimeException ignored) {
                // 反查失败后才进入结果未知分支。
            }
        }
        if (completeIfRunning(row, "TIMEOUT", null, "结果未知", null, null, null, now)) {
            scheduleAfterCompletion(job, row, now);
            alarm(job, "结果未知", row.getExecuteNo(), "执行结果回报与状态反查均不可用");
        }
    }

    private boolean completeIfRunning(SysJobLog row, String status, Integer affectedRows,
                                      String resultMsg, String exceptionStack, String executorIp,
                                      Long durationMs, LocalDateTime completedAt) {
        return completeIfRunning(row, status, affectedRows, resultMsg, exceptionStack, executorIp, durationMs, completedAt, true);
    }

    private boolean completeIfRunning(SysJobLog row, String status, Integer affectedRows,
                                      String resultMsg, String exceptionStack, String executorIp,
                                      Long durationMs, LocalDateTime completedAt, boolean retryLinkRace) {
        boolean managedSync = "imOrganizationSync".equals(row.getHandlerName());
        if ("imOrganizationSync".equals(row.getHandlerName()) && row.getResultMsg() != null
                && row.getResultMsg().matches("IM_SYNC_RUN=[1-9][0-9]{0,18};.*")) {
            String reference = row.getResultMsg().substring(0, row.getResultMsg().indexOf(';') + 1);
            if (resultMsg == null || !resultMsg.startsWith(reference)) resultMsg = reference + (resultMsg == null ? "" : resultMsg);
            if (resultMsg.length() > 1000) resultMsg = resultMsg.substring(0, 1000);
        }
        int updated = logMapper.update(null, new LambdaUpdateWrapper<SysJobLog>()
                .eq(SysJobLog::getExecuteNo, row.getExecuteNo())
                .eq(SysJobLog::getExecuteStatus, "RUNNING")
                .eq(managedSync && row.getResultMsg() != null, SysJobLog::getResultMsg, row.getResultMsg())
                .isNull(managedSync && row.getResultMsg() == null, SysJobLog::getResultMsg)
                .set(SysJobLog::getExecuteStatus, status)
                .set(SysJobLog::getAffectedRows, affectedRows)
                .set(SysJobLog::getResultMsg, resultMsg)
                .set(SysJobLog::getExceptionStack, exceptionStack)
                .set(executorIp != null, SysJobLog::getExecutorIp, executorIp)
                .set(SysJobLog::getDurationMs, durationMs)
                .set(SysJobLog::getEndTime, completedAt)
                .set(SysJobLog::getReportTime, completedAt));
        if (updated == 0) {
            if (managedSync && retryLinkRace) {
                SysJobLog latest = logMapper.lockRunningOrganizationSync(row.getTenantId(), row.getExecuteNo());
                if (latest != null && !java.util.Objects.equals(latest.getResultMsg(), row.getResultMsg())) {
                    BeanUtils.copyProperties(latest, row);
                    return completeIfRunning(row, status, affectedRows, resultMsg, exceptionStack, executorIp, durationMs, completedAt, false);
                }
            }
            return false;
        }
        row.setExecuteStatus(status);
        row.setAffectedRows(affectedRows);
        row.setResultMsg(resultMsg);
        row.setExceptionStack(exceptionStack);
        row.setDurationMs(durationMs);
        row.setEndTime(completedAt);
        return true;
    }

    private void handleTerminalResult(SysJob job, SysJobLog row, String status) {
        if (job == null) return;
        scheduleAfterCompletion(job, row, row.getEndTime() == null ? LocalDateTime.now() : row.getEndTime());
        if ("SUCCESS".equals(status)) {
            jobMapper.update(null, new LambdaUpdateWrapper<SysJob>()
                    .eq(SysJob::getJobId, job.getJobId())
                    .set(SysJob::getConsecutiveFailCount, 0));
            if (Integer.valueOf(0).equals(job.getLogSuccessFlag())) {
                logMapper.delete(new LambdaQueryWrapper<SysJobLog>()
                        .eq(SysJobLog::getExecuteNo, row.getExecuteNo())
                        .eq(SysJobLog::getExecuteStatus, "SUCCESS"));
            }
            return;
        }
        if ("FAILED".equals(status)) {
            int currentRetry = row.getRetryIndex() == null ? 0 : row.getRetryIndex();
            int retryLimit = Math.max(0, job.getRetryCount() == null ? 0 : job.getRetryCount());
            if (currentRetry < retryLimit && "ENABLED".equals(job.getStatus())
                    && Integer.valueOf(0).equals(job.getDeleted())) {
                scheduleBusinessRetry(job, currentRetry + 1);
                return;
            }
            int failures = (job.getConsecutiveFailCount() == null ? 0 : job.getConsecutiveFailCount()) + 1;
            jobMapper.update(null, new LambdaUpdateWrapper<SysJob>()
                    .eq(SysJob::getJobId, job.getJobId())
                    .set(SysJob::getConsecutiveFailCount, failures));
            String message = failures >= Math.max(1, alarmEscalationThreshold)
                    ? "任务连续执行失败" : "任务执行失败";
            alarm(job, message, row.getExecuteNo(), row.getExceptionStack());
        } else if ("TIMEOUT".equals(status)) {
            alarm(job, "结果未知", row.getExecuteNo(), row.getExceptionStack());
        }
    }

    private void scheduleAfterCompletion(SysJob job, SysJobLog row, LocalDateTime completedAt) {
        if (job == null || !"FIXED_DELAY".equals(job.getTriggerType())
                || "MANUAL".equals(row.getTriggerType())) return;
        LocalDateTime nextFireTime = "ENABLED".equals(job.getStatus())
                ? calculateNextFireTime(job, completedAt) : null;
        updateFireTimes(job, null, nextFireTime);
    }

    private void scheduleBusinessRetry(SysJob job, int retryIndex) {
        int retrySeconds = Math.max(1, job.getRetryIntervalSec() == null ? 60 : job.getRetryIntervalSec());
        Runnable register = () -> scheduler.schedule(() -> {
            try {
                dispatchExecutor.execute(() -> {
                    SysJob current = jobMapper.selectById(job.getJobId());
                    if (current != null && "ENABLED".equals(current.getStatus())
                            && Integer.valueOf(0).equals(current.getDeleted())) {
                        dispatch(current, current.getHandlerParam(), "RETRY", "system-retry", retryIndex);
                    }
                });
            } catch (RuntimeException e) {
                log.error("任务执行重试提交失败, jobId={}, retryIndex={}", job.getJobId(), retryIndex, e);
            }
        }, java.time.Instant.now().plusSeconds(retrySeconds));
        runAfterCommit(register);
    }

    private String normalizeResultStatus(String status) {
        if (!StringUtils.hasText(status)) return "FAILED";
        if (Set.of("SUCCESS", "FAILED", "TIMEOUT", "SKIPPED", "DISPATCH_FAILED").contains(status)) {
            return status;
        }
        return "FAILED";
    }

    private void enqueueMisfire(SysJob job, JobExecuteDTO request, String triggerType, int retryIndex) {
        String strategy = job.getMisfireStrategy() == null ? "IGNORE" : job.getMisfireStrategy().toUpperCase();
        if (!Set.of("FIRE_ONCE", "FIRE_ALL").contains(strategy)) {
            return;
        }
        String markerKey = misfireMarkerKey(job);
        boolean markerCreated = false;
        try {
            if ("FIRE_ONCE".equals(strategy)) {
                markerCreated = Boolean.TRUE.equals(redisTemplate.opsForValue()
                        .setIfAbsent(markerKey, "1", Duration.ofDays(7)));
                if (!markerCreated) return;
            }
            MisfireItem item = new MisfireItem(job.getJobId(), request.getHandlerName(), request.getHandlerParam(),
                    triggerType, job.getTenantId(), strategy, Math.max(0, retryIndex));
            redisTemplate.opsForList().leftPush(MISFIRE_QUEUE_KEY, objectMapper.writeValueAsString(item));
        } catch (RuntimeException | JsonProcessingException e) {
            if (markerCreated) redisTemplate.delete(markerKey);
            // 补跑队列为短期容错数据，序列化失败时保留原调度失败结果并记录告警。
            alarm(job, "网络调度失败", request.getExecuteNo(), "补跑队列写入失败");
        }
    }

    private void submitMisfireDrain() {
        long now = System.currentTimeMillis();
        long earliest = nextMisfireDrainAt.get();
        if (now < earliest || !nextMisfireDrainAt.compareAndSet(earliest, now + 30000L)) return;
        try {
            dispatchExecutor.execute(this::drainMisfireQueue);
        } catch (RuntimeException e) {
            nextMisfireDrainAt.set(0L);
            log.warn("任务补跑队列巡检提交失败: {}", e.getMessage());
        }
    }

    private void drainMisfireQueue() {
        RLock drainLock = redissonClient.getLock("cloudflow:job:misfire:drain");
        boolean locked = false;
        try {
            locked = drainLock.tryLock(0, TimeUnit.SECONDS);
            if (!locked) return;
            Long queuedCount = redisTemplate.opsForList().size(MISFIRE_QUEUE_KEY);
            long attempts = queuedCount == null ? 0 : Math.min(100L, queuedCount);
            for (long attempt = 0; attempt < attempts; attempt++) {
                String raw = redisTemplate.opsForList().index(MISFIRE_QUEUE_KEY, -1);
                if (!StringUtils.hasText(raw)) return;
                MisfireItem item;
                try {
                    item = objectMapper.readValue(raw, MisfireItem.class);
                } catch (Exception e) {
                    redisTemplate.opsForList().rightPop(MISFIRE_QUEUE_KEY);
                    log.warn("任务补跑队列项无效: {}", e.getMessage());
                    continue;
                }
                SysJob job = TenantBroker.applyWithoutTenant(ignored -> jobMapper.selectById(item.jobId()));
                if (job == null || !"ENABLED".equals(job.getStatus())
                        || !Integer.valueOf(0).equals(job.getDeleted())) {
                    redisTemplate.opsForList().rightPop(MISFIRE_QUEUE_KEY);
                    clearMisfireMarker(item);
                    continue;
                }
                JobTriggerResultVO result = dispatch(job, item.handlerParam(), "RETRY", "misfire",
                        item.retryIndex() == null ? 0 : item.retryIndex(), false);
                if (!result.isAccepted()) {
                    redisTemplate.opsForList().rightPopAndLeftPush(MISFIRE_QUEUE_KEY, MISFIRE_QUEUE_KEY);
                    continue;
                }
                redisTemplate.opsForList().rightPop(MISFIRE_QUEUE_KEY);
                clearMisfireMarker(item);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            log.warn("任务补跑队列巡检失败: {}", e.getMessage());
        } finally {
            try {
                if (locked && drainLock.isHeldByCurrentThread()) drainLock.unlock();
            } catch (RuntimeException e) {
                log.warn("任务补跑队列锁释放失败: {}", e.getMessage());
            }
        }
    }

    private void clearMisfireMarker(MisfireItem item) {
        if (item != null && "FIRE_ONCE".equals(item.strategy())) {
            redisTemplate.delete(MISFIRE_ONCE_MARKER_PREFIX + item.tenantId() + ":" + item.jobId());
        }
    }

    private String misfireMarkerKey(SysJob job) {
        return MISFIRE_ONCE_MARKER_PREFIX + job.getTenantId() + ":" + job.getJobId();
    }

    private void alarm(SysJob job, String message, String executeNo, String detail) {
        if (job == null || !Integer.valueOf(1).equals(job.getAlarmOnFailFlag())
                || !StringUtils.hasText(job.getAlarmReceiver())) {
            return;
        }
        List<MessageReceiver> receivers = new ArrayList<>();
        for (String value : job.getAlarmReceiver().split(",")) {
            try {
                if (StringUtils.hasText(value)) receivers.add(MessageReceiver.ofUser(Long.valueOf(value.trim())));
            } catch (NumberFormatException ignored) {
                // 忽略非法接收人配置，避免告警链路阻塞任务状态落库。
            }
        }
        if (receivers.isEmpty()) return;
        try {
            String summary = StringUtils.hasText(detail) ? detail.replaceAll("[\\r\\n]+", " ") : "无";
            if (summary.length() > 500) summary = summary.substring(0, 500);
            messageSender.send(MessageSendRequest.builder()
                    .templateCode("SYS_JOB_ALARM")
                    .channelTypes(List.of(MessageChannelType.INTERNAL))
                    .receivers(receivers)
                    .category(MessageCategory.SYSTEM)
                    .bizType("SYS_JOB")
                    .bizId(executeNo)
                    .linkUrl("/job/log?jobId=" + job.getJobId())
                    .title("定时任务告警")
                    .content(message + "；任务：" + job.getJobName() + "；失败时间："
                            + LocalDateTime.now().format(DATE_TIME) + "；异常摘要：" + summary
                            + "；执行编号：" + executeNo)
                    .build());
        } catch (RuntimeException ignored) {
            // 告警发送失败不影响任务日志主流程。
        }
    }

    private String localAddress() {
        if (StringUtils.hasText(instanceAddress)) {
            return instanceAddress.trim();
        }
        try {
            return java.net.InetAddress.getLocalHost().getHostAddress();
        } catch (Exception ignored) {
            return null;
        }
    }

    private record MisfireItem(Long jobId, String handlerName, String handlerParam,
                               String triggerType, Long tenantId, String strategy, Integer retryIndex) {
    }

    private SysJob owned(Long id) {
        SysJob job = jobMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysJob>().eq(SysJob::getJobId, id).eq(SysJob::getTenantId, tenantId()).eq(SysJob::getDeleted, 0));
        if (job == null) throw new ServiceException("定时任务不存在", 404); return job;
    }

    private void validate(SysJobDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getServiceName()) || !StringUtils.hasText(dto.getHandlerName()) || !StringUtils.hasText(dto.getJobName())) throw new ServiceException("任务名称、服务名和 Handler 不能为空");
        String serviceName = canonicalServiceName(dto.getServiceName());
        if (!isSupportedService(serviceName)) throw new ServiceException("任务归属服务不受支持");
        SysJobHandler handler = handlerMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysJobHandler>()
                .eq(SysJobHandler::getServiceName, serviceName)
                .eq(SysJobHandler::getHandlerName, dto.getHandlerName())
                .eq(SysJobHandler::getStatus, "ONLINE"));
        if (handler == null) throw new ServiceException("Handler 尚未上报或已离线");
        String type = dto.getTriggerType() == null ? "CRON" : dto.getTriggerType();
        if (!Set.of("CRON", "FIXED_RATE", "FIXED_DELAY").contains(type)) throw new ServiceException("触发类型不合法");
        if ("CRON".equals(type) && !validateCron(new CronValidateDTO() {{ setCronExpression(dto.getCronExpression()); setTriggerType(type); }}).isValid()) throw new ServiceException("CRON 表达式不合法");
        if (("FIXED_RATE".equals(type) || "FIXED_DELAY".equals(type)) && (dto.getIntervalMs() == null || dto.getIntervalMs() <= 0)) throw new ServiceException("固定间隔必须大于0");
        if (StringUtils.hasText(dto.getStatus()) && !Set.of("ENABLED", "PAUSED").contains(dto.getStatus())) throw new ServiceException("任务状态不合法");
        if (StringUtils.hasText(dto.getMisfireStrategy()) && !Set.of("IGNORE", "FIRE_ONCE", "FIRE_ALL").contains(dto.getMisfireStrategy())) throw new ServiceException("错过策略不合法");
        validateFlag(dto.getConcurrentFlag(), "并发开关");
        validateFlag(dto.getCriticalFlag(), "关键任务标记");
        validateFlag(dto.getLogSuccessFlag(), "成功日志开关");
        validateFlag(dto.getAlarmOnFailFlag(), "失败告警开关");
        if (dto.getRetryCount() != null && dto.getRetryCount() < 0) throw new ServiceException("执行重试次数不能小于0");
        if (dto.getDispatchRetryCount() != null && dto.getDispatchRetryCount() < 0) throw new ServiceException("调度重试次数不能小于0");
        if (dto.getRetryIntervalSec() != null && dto.getRetryIntervalSec() <= 0) throw new ServiceException("执行重试间隔必须大于0");
        if (dto.getDispatchRetryIntervalSec() != null && dto.getDispatchRetryIntervalSec() <= 0) throw new ServiceException("调度重试间隔必须大于0");
        if (dto.getTimeoutSeconds() != null && dto.getTimeoutSeconds() <= 0) throw new ServiceException("超时秒数必须大于0");
        if (dto.getLockTimeSeconds() != null && dto.getLockTimeSeconds() <= 0) throw new ServiceException("锁持有秒数必须大于0");
    }

    private void validateFlag(Integer value, String name) {
        if (value != null && value != 0 && value != 1) throw new ServiceException(name + "只能为0或1");
    }

    private void copy(SysJobDTO dto, SysJob job) {
        BeanUtils.copyProperties(dto, job, "jobId", "confirmCritical", "tenantId", "deleted", "version", "createBy", "createTime", "updateBy", "updateTime");
        job.setServiceName(canonicalServiceName(dto.getServiceName()));
        if (!StringUtils.hasText(job.getTriggerType())) job.setTriggerType("CRON"); if (!StringUtils.hasText(job.getStatus())) job.setStatus("ENABLED");
        if (job.getJobGroup() == null) job.setJobGroup("DEFAULT"); if (job.getTimeoutSeconds() == null) job.setTimeoutSeconds(1800); if (job.getLockTimeSeconds() == null) job.setLockTimeSeconds(300);
        if (job.getRetryIntervalSec() == null) job.setRetryIntervalSec(60); if (job.getDispatchRetryCount() == null) job.setDispatchRetryCount(3); if (job.getDispatchRetryIntervalSec() == null) job.setDispatchRetryIntervalSec(10);
        if (job.getLogSuccessFlag() == null) job.setLogSuccessFlag(1); if (job.getAlarmOnFailFlag() == null) job.setAlarmOnFailFlag(1); if (job.getConcurrentFlag() == null) job.setConcurrentFlag(0); if (job.getMisfireStrategy() == null) job.setMisfireStrategy("IGNORE");
    }

    private void runAfterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
            return;
        }
        action.run();
    }

    private void recordJobAudit(String auditName, String field, String beforeValue, String afterValue) {
        SysAuditLogEntity audit = new SysAuditLogEntity();
        audit.setTenantId(tenantId());
        audit.setBizModule("system-job");
        audit.setAuditName(auditName);
        audit.setAuditField(field);
        audit.setBeforeVal(beforeValue);
        audit.setAfterVal(afterValue);
        audit.setHighRisk(1);
        audit.setRiskLevel("HIGH");
        audit.setCreateBy(userName());
        audit.setCreateTime(LocalDateTime.now());
        auditLogMapper.insert(audit);
    }

    private LocalDateTime parseDateTime(String raw, boolean endOfDay) {
        if (!StringUtils.hasText(raw)) return null;
        String value = raw.trim();
        try {
            if (value.length() == 10) {
                LocalDate date = LocalDate.parse(value);
                return endOfDay ? date.plusDays(1).atStartOfDay().minusNanos(1) : date.atStartOfDay();
            }
            try {
                return LocalDateTime.parse(value, DATE_TIME);
            } catch (RuntimeException ignored) {
                return LocalDateTime.parse(value);
            }
        } catch (RuntimeException e) {
            throw new ServiceException("时间格式不合法，应为 yyyy-MM-dd 或 yyyy-MM-dd HH:mm:ss");
        }
    }

    private Long tenantId() { return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId(); }
    private String userName() { return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system"; }
    private String canonicalServiceName(String serviceName) {
        if (!StringUtils.hasText(serviceName)) return serviceName;
        return switch (serviceName.trim()) {
            case "cloudflow-auth", "auth" -> "auth";
            case "cloudflow-service-workflow", "workflow" -> "workflow";
            case "cloudflow-service-oa", "oa" -> "oa";
            case "cloudflow-service-crm", "crm" -> "crm";
            case "cloudflow-service-hr", "hr" -> "hr";
            default -> serviceName.trim();
        };
    }
    private boolean isSupportedService(String serviceName) {
        String canonical = canonicalServiceName(serviceName);
        return canonical != null && Set.of("auth", "workflow", "oa", "crm", "hr").contains(canonical);
    }
    private <T> PageResult<T> page(List<T> rows, int pageNum, int pageSize) { int p=Math.max(1,pageNum),s=Math.max(1,Math.min(200,pageSize)),from=Math.min((p-1)*s,rows.size()),to=Math.min(from+s,rows.size()); return new PageResult<>(rows.subList(from,to),rows.size(),p,s); }
}

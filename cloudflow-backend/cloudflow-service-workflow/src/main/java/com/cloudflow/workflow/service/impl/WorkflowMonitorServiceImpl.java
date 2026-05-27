package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.monitor.*;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.exception.BusinessException;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.service.IWorkflowMonitorService;
import com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/**
 * 工作流监控服务实现
 * Phase 2 新增功能
 *
 * @author CloudFlow Team
 * @since 2026-02-22
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowMonitorServiceImpl implements IWorkflowMonitorService {

    private final ProcessMonitorMapper processMonitorMapper;
    private final TimeoutAlertMapper timeoutAlertMapper;
    private final AnomalyAlertMapper anomalyAlertMapper;
    private final PerformanceStatsMapper performanceStatsMapper;
    private final TaskMonitorMapper taskMonitorMapper;
    private final WfTaskMapper wfTaskMapper;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDeptMapper sysDeptMapper;
    private final SysRoleMapper sysRoleMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final INotificationService notificationService;
    private final PerformanceStatsRefreshService performanceStatsRefreshService;

    private static final String ACTION_NOTIFY = "notify";
    private static final String ACTION_ESCALATE = "escalate";
    private static final String EVENT_TIMEOUT_ALERT_ESCALATED = "TIMEOUT_ALERT_ESCALATED";
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String HEALTH_STABLE = "稳定";
    private static final String HEALTH_CONTROLLABLE = "可控";
    private static final String HEALTH_WARNING = "预警";
    private static final String HEALTH_OBSERVING = "观察中";

    @Override
    public MonitorOverview getMonitorOverview() {
        log.info("获取监控概览数据");
        
        Long tenantId = resolveTenantId();
        
        MonitorOverview overview = new MonitorOverview();
        LocalDateTime todayStart = LocalDateTime.now().withHour(0).withMinute(0).withSecond(0);
        
        // 今日统计
        overview.setTodayStarted(processMonitorMapper.countByDateAndStatus(todayStart, null, tenantId));
        overview.setTodayCompleted(processMonitorMapper.countByDateAndStatus(todayStart, "COMPLETED", tenantId));
        overview.setTodayTimeout(timeoutAlertMapper.countByDate(todayStart, tenantId));
        overview.setTodayAnomaly(anomalyAlertMapper.countByDate(todayStart, tenantId));
        
        // 当前状态
        overview.setRunningCount(processMonitorMapper.countByStatus("RUNNING", tenantId));
        overview.setPendingTaskCount(processMonitorMapper.countPendingTasks(tenantId));
        
        // 告警统计
        overview.setWarningAlertCount(timeoutAlertMapper.countByLevel("WARNING", tenantId));
        overview.setCriticalAlertCount(timeoutAlertMapper.countByLevel("CRITICAL", tenantId));
        overview.setUnresolvedAnomalyCount(anomalyAlertMapper.countUnresolved(tenantId));
        
        // 性能指标
        overview.setAvgCompletionTimeMs(processMonitorMapper.getAvgCompletionTime(tenantId));
        overview.setSuccessRate(processMonitorMapper.getSuccessRate(tenantId));
        
        return overview;
    }

    @Override
    public List<ProcessTrend> getProcessTrend(Integer days, String processDefKey) {
        log.info("获取流程趋势数据: days={}, processDefKey={}", days, processDefKey);
        
        Long tenantId = resolveTenantId();
        
        LocalDateTime startDate = LocalDateTime.now().minusDays(days);
        return processMonitorMapper.getProcessTrend(startDate, processDefKey, tenantId);
    }

    @Override
    public PageResult<ProcessMonitor> getProcessMonitors(String processDefKey, String status,
                                             String startTimeFrom, String startTimeTo,
                                             Integer pageNum, Integer pageSize) {
        log.info("获取流程监控列表: processDefKey={}, status={}", processDefKey, status);
        
        Page<ProcessMonitor> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<ProcessMonitor> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProcessMonitor::getTenantId, resolveTenantId());
        
        if (StringUtils.hasText(processDefKey)) {
            wrapper.eq(ProcessMonitor::getProcessDefKey, processDefKey);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(ProcessMonitor::getStatus, status);
        }
        if (StringUtils.hasText(startTimeFrom)) {
            wrapper.ge(ProcessMonitor::getStartTime, startTimeFrom);
        }
        if (StringUtils.hasText(startTimeTo)) {
            wrapper.le(ProcessMonitor::getStartTime, startTimeTo);
        }
        
        wrapper.orderByDesc(ProcessMonitor::getStartTime);
        Page<ProcessMonitor> resultPage = processMonitorMapper.selectPage(page, wrapper);
        
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), 
                               resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    public ProcessMonitor getProcessMonitor(String instanceId) {
        log.info("获取流程监控详情: instanceId={}", instanceId);
        return processMonitorMapper.selectByInstanceId(instanceId, resolveTenantId());
    }

    @Override
    public PageResult<TimeoutAlert> getTimeoutAlerts(String alertType, String alertLevel,
                                         Boolean resolved, Integer pageNum, Integer pageSize) {
        log.info("获取超时告警列表: alertType={}, alertLevel={}, resolved={}", 
                alertType, alertLevel, resolved);
        
        Page<TimeoutAlert> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TimeoutAlert::getTenantId, resolveTenantId());
        
        if (StringUtils.hasText(alertType)) {
            wrapper.eq(TimeoutAlert::getAlertType, alertType);
        }
        if (StringUtils.hasText(alertLevel)) {
            wrapper.eq(TimeoutAlert::getTimeoutLevel, alertLevel);
        }
        if (resolved != null) {
            wrapper.eq(TimeoutAlert::getResolved, resolved ? "Y" : "N");
        }
        
        wrapper.orderByDesc(TimeoutAlert::getAlertTime);
        Page<TimeoutAlert> resultPage = timeoutAlertMapper.selectPage(page, wrapper);
        
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), 
                               resultPage.getCurrent(), resultPage.getSize());
    }

    private static final Map<String, String> TIMEOUT_LEVEL_LABELS = Map.of(
            "REMIND", "提醒",
            "WARNING", "警告",
            "CRITICAL", "严重"
    );
    private static final Map<String, String> ANOMALY_TYPE_LABELS = Map.ofEntries(
            Map.entry("EXECUTION_FAILED",     "执行失败"),
            Map.entry("NO_ASSIGNEE",          "无人认领"),
            Map.entry("DEADLOCK",             "死锁"),
            Map.entry("DATA_INCONSISTENCY",   "数据不一致"),
            Map.entry("BUSINESS_EXCEPTION",   "业务异常"),
            Map.entry("CALLBACK_FAILED",      "回调失败"),
            Map.entry("NODE_TIMEOUT",         "节点超时"),
            Map.entry("APPROVER_UNAVAILABLE", "审批人不可用"),
            Map.entry("APPROVER_INVALID",     "审批人无效"),
            Map.entry("APPROVAL_NODE_TIMEOUT","审批节点超时")
    );

    @Override
    @Transactional
    public TimeoutAlertHandleResult handleTimeoutAlert(Long alertId, String action) {
        log.info("处理超时告警: alertId={}, action={}", alertId, action);
        
        TimeoutAlert alert = timeoutAlertMapper.selectById(alertId);
        if (alert == null) {
            throw new BusinessException("ALERT_NOT_FOUND", "告警不存在");
        }
        checkTenantAccess(alert.getTenantId());
        
        if (ACTION_NOTIFY.equals(action)) {
            alert.setNotificationSent("Y");
            alert.setUpdateTime(LocalDateTime.now());
            timeoutAlertMapper.updateById(alert);
            log.info("已发送超时告警通知: alertId={}", alertId);
            return new TimeoutAlertHandleResult(alertId, action, null, null, null, "已发送通知");
        }

        if (ACTION_ESCALATE.equals(action)) {
            return escalateTimeoutAlert(alert);
        }

        throw new BusinessException("INVALID_ALERT_ACTION", "不支持的告警处理动作");
    }

    @Override
    public PageResult<TimeoutAlert> getTimeoutEscalationTasks(Integer pageNum, Integer pageSize) {
        Long currentUserId = requireCurrentUserId();
        Page<TimeoutAlert> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<TimeoutAlert> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(TimeoutAlert::getTenantId, resolveTenantId())
                .eq(TimeoutAlert::getEscalated, "Y")
                .eq(TimeoutAlert::getResolved, "N");

        if (!SecurityUtils.isAdmin(currentUserId)) {
            wrapper.eq(TimeoutAlert::getEscalatedToId, currentUserId);
        }

        wrapper.orderByDesc(TimeoutAlert::getEscalatedTime)
                .orderByDesc(TimeoutAlert::getAlertTime);

        Page<TimeoutAlert> resultPage = timeoutAlertMapper.selectPage(page, wrapper);
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(),
                resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional
    public TimeoutAlert resolveTimeoutAlert(Long alertId, String resolveNote) {
        TimeoutAlert alert = timeoutAlertMapper.selectById(alertId);
        if (alert == null) {
            throw new BusinessException("ALERT_NOT_FOUND", "告警不存在");
        }
        checkTenantAccess(alert.getTenantId());

        if ("Y".equals(alert.getResolved())) {
            return alert;
        }

        if (!"Y".equals(alert.getEscalated()) || alert.getEscalatedToId() == null) {
            throw new BusinessException("ALERT_NOT_ESCALATED", "未升级告警不能通过升级处置关闭");
        }

        Long currentUserId = requireCurrentUserId();
        if (!SecurityUtils.isAdmin(currentUserId) && !Objects.equals(alert.getEscalatedToId(), currentUserId)) {
            throw new PermissionDeniedException("仅升级接收人或管理员可处置该告警");
        }
        if (!StringUtils.hasText(resolveNote)) {
            throw new BusinessException("RESOLVE_NOTE_REQUIRED", "处理说明不能为空");
        }

        alert.setResolved("Y");
        alert.setResolvedById(currentUserId);
        alert.setResolvedByName(resolveCurrentUserName());
        alert.setResolveNote(resolveNote.trim());
        alert.setResolveTime(LocalDateTime.now());
        alert.setUpdateTime(LocalDateTime.now());
        timeoutAlertMapper.updateById(alert);
        performanceStatsRefreshService.refreshForTimeoutAlert(alert);
        return alert;
    }

    @Override
    public PageResult<AnomalyAlert> getAnomalyAlerts(String anomalyType, String severity,
                                         Boolean resolved, Integer pageNum, Integer pageSize) {
        log.info("获取异常告警列表: anomalyType={}, severity={}, resolved={}", 
                anomalyType, severity, resolved);
        
        Page<AnomalyAlert> page = new Page<>(pageNum, pageSize);
        LambdaQueryWrapper<AnomalyAlert> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AnomalyAlert::getTenantId, resolveTenantId());
        
        if (StringUtils.hasText(anomalyType)) {
            wrapper.eq(AnomalyAlert::getAnomalyType, anomalyType);
        }
        if (StringUtils.hasText(severity)) {
            wrapper.eq(AnomalyAlert::getSeverity, severity);
        }
        if (resolved != null) {
            applyAnomalyResolvedFilter(wrapper, resolved);
        }
        
        wrapper.orderByDesc(AnomalyAlert::getAlertTime);
        Page<AnomalyAlert> resultPage = anomalyAlertMapper.selectPage(page, wrapper);
        
        return new PageResult<>(resultPage.getRecords(), resultPage.getTotal(), 
                               resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional
    public void resolveAnomalyAlert(Long alertId, String resolveNote) {
        log.info("解决异常告警: alertId={}, resolveNote={}", alertId, resolveNote);
        
        AnomalyAlert alert = anomalyAlertMapper.selectById(alertId);
        if (alert == null) {
            throw new RuntimeException("告警不存在");
        }
        checkTenantAccess(alert.getTenantId());
        
        alert.setResolved("Y");
        alert.setResolveNote(resolveNote);
        alert.setResolveTime(LocalDateTime.now());
        alert.setUpdateTime(LocalDateTime.now());
        anomalyAlertMapper.updateById(alert);
        performanceStatsRefreshService.refreshForAnomalyAlert(alert);
        
        log.info("异常告警已解决: alertId={}", alertId);
    }

    @Override
    public PerformanceDashboardResponse getPerformanceDashboard(LocalDate startDate, LocalDate endDate,
                                                                String processDefKey) {
        Long tenantId = resolveTenantId();
        LocalDate[] normalizedRange = normalizeDateRange(startDate, endDate);
        LocalDate normalizedStartDate = normalizedRange[0];
        LocalDate normalizedEndDate = normalizedRange[1];
        int daySpan = (int) ChronoUnit.DAYS.between(normalizedStartDate, normalizedEndDate) + 1;
        LocalDate compareEndDate = normalizedStartDate.minusDays(1);
        LocalDate compareStartDate = compareEndDate.minusDays(daySpan - 1L);

        List<PerformanceStats> currentRows = performanceStatsMapper.selectPerformanceStats(
                normalizedStartDate, normalizedEndDate, processDefKey, tenantId
        );
        List<PerformanceStats> compareRows = performanceStatsMapper.selectPerformanceStats(
                compareStartDate, compareEndDate, processDefKey, tenantId
        );

        PerformanceDashboardContext context = new PerformanceDashboardContext();
        context.setStartDate(normalizedStartDate);
        context.setEndDate(normalizedEndDate);
        context.setCompareStartDate(compareStartDate);
        context.setCompareEndDate(compareEndDate);
        context.setProcessDefKey(processDefKey);
        context.setProcessLabel(resolveProcessLabel(processDefKey, currentRows, compareRows));
        context.setDaySpan(daySpan);

        PerformanceDashboardResponse response = new PerformanceDashboardResponse();
        response.setContext(context);
        response.setSummary(buildSummary(currentRows));
        response.setCompareSummary(buildSummary(compareRows));
        response.setTrend(buildTrend(currentRows));
        response.setProcesses(buildProcessRows(currentRows));
        return response;
    }

    @Override
    public PerformanceRiskBreakdownResponse getPerformanceRiskBreakdown(LocalDate startDate, LocalDate endDate,
                                                                        String processDefKey) {
        Long tenantId = resolveTenantId();
        LocalDate[] normalizedRange = normalizeDateRange(startDate, endDate);
        List<PerformanceTimeoutLevelBreakdownItem> timeoutLevels = timeoutAlertMapper.selectTimeoutLevelBreakdown(
                normalizedRange[0], normalizedRange[1], processDefKey, tenantId
        );
        List<PerformanceAnomalyTypeBreakdownItem> anomalyTypes = anomalyAlertMapper.selectAnomalyTypeBreakdown(
                normalizedRange[0], normalizedRange[1], processDefKey, tenantId
        );

        int timeoutTotal = timeoutLevels.stream().mapToInt((item) -> safeInt(item.getCount())).sum();
        int anomalyTotal = anomalyTypes.stream().mapToInt((item) -> safeInt(item.getCount())).sum();

        timeoutLevels.forEach((item) -> {
            item.setLabel(resolveTimeoutLevelLabel(item.getLevel()));
            item.setRate(roundRate(safeInt(item.getCount()), timeoutTotal));
        });
        anomalyTypes.forEach((item) -> {
            item.setLabel(resolveAnomalyTypeLabel(item.getType()));
            item.setRate(roundRate(safeInt(item.getCount()), anomalyTotal));
        });

        PerformanceRiskBreakdownTotals totals = new PerformanceRiskBreakdownTotals();
        totals.setTimeoutTotal(timeoutTotal);
        totals.setAnomalyTotal(anomalyTotal);

        PerformanceRiskBreakdownResponse response = new PerformanceRiskBreakdownResponse();
        response.setTimeoutLevels(timeoutLevels);
        response.setAnomalyTypes(anomalyTypes);
        response.setTotals(totals);
        return response;
    }

    @Override
    public List<PerformanceStats> getPerformanceStats(LocalDate startDate, LocalDate endDate, 
                                                      String processDefKey) {
        log.info("获取性能统计数据: startDate={}, endDate={}, processDefKey={}", 
                startDate, endDate, processDefKey);

        LocalDate[] normalizedRange = normalizeDateRange(startDate, endDate);
        return performanceStatsMapper.selectPerformanceStats(
                normalizedRange[0],
                normalizedRange[1],
                processDefKey,
                resolveTenantId()
        );
    }

    private PerformanceDashboardSummary buildSummary(List<PerformanceStats> rows) {
        PerformanceAccumulator accumulator = new PerformanceAccumulator();
        rows.forEach(accumulator::add);
        return accumulator.toSummary();
    }

    private List<PerformanceDashboardTrendPoint> buildTrend(List<PerformanceStats> rows) {
        Map<LocalDate, PerformanceAccumulator> grouped = new TreeMap<>();
        for (PerformanceStats row : rows) {
            if (row.getStatDate() == null) {
                continue;
            }
            grouped.computeIfAbsent(row.getStatDate(), ignored -> new PerformanceAccumulator()).add(row);
        }

        List<PerformanceDashboardTrendPoint> trendPoints = new ArrayList<>();
        for (Map.Entry<LocalDate, PerformanceAccumulator> entry : grouped.entrySet()) {
            trendPoints.add(entry.getValue().toTrendPoint(entry.getKey()));
        }
        return trendPoints;
    }

    private List<PerformanceDashboardProcessRow> buildProcessRows(List<PerformanceStats> rows) {
        Map<String, PerformanceAccumulator> grouped = new LinkedHashMap<>();
        for (PerformanceStats row : rows) {
            String processKey = StringUtils.hasText(row.getProcessDefKey()) ? row.getProcessDefKey() : "__unknown__";
            PerformanceAccumulator accumulator = grouped.computeIfAbsent(processKey, ignored -> new PerformanceAccumulator());
            accumulator.setProcess(processKey, row.getProcessName());
            accumulator.add(row);
        }

        return grouped.values().stream()
                .map(PerformanceAccumulator::toProcessRow)
                .sorted(Comparator
                        .comparing(PerformanceDashboardProcessRow::getRiskScore, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(PerformanceDashboardProcessRow::getTotalCount, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(PerformanceDashboardProcessRow::getProcessName, Comparator.nullsLast(String::compareToIgnoreCase)))
                .toList();
    }

    private String resolveProcessLabel(String processDefKey, List<PerformanceStats> currentRows,
                                       List<PerformanceStats> compareRows) {
        if (!StringUtils.hasText(processDefKey)) {
            return "全部流程";
        }

        for (PerformanceStats row : currentRows) {
            if (processDefKey.equals(row.getProcessDefKey()) && StringUtils.hasText(row.getProcessName())) {
                return row.getProcessName();
            }
        }
        for (PerformanceStats row : compareRows) {
            if (processDefKey.equals(row.getProcessDefKey()) && StringUtils.hasText(row.getProcessName())) {
                return row.getProcessName();
            }
        }
        return processDefKey;
    }

    private LocalDate[] normalizeDateRange(LocalDate startDate, LocalDate endDate) {
        LocalDate normalizedEndDate = endDate != null ? endDate : LocalDate.now();
        LocalDate normalizedStartDate = startDate != null ? startDate : normalizedEndDate.minusDays(29);
        if (normalizedStartDate.isAfter(normalizedEndDate)) {
            LocalDate swap = normalizedStartDate;
            normalizedStartDate = normalizedEndDate;
            normalizedEndDate = swap;
        }
        return new LocalDate[] { normalizedStartDate, normalizedEndDate };
    }

    private Long resolveTenantId() {
        Long tenantId = SecurityUtils.getTenantId();
        return tenantId != null ? tenantId : 100000L;
    }

    private void checkTenantAccess(Long dataTenantId) {
        Long tenantId = resolveTenantId();
        if (dataTenantId != null && !dataTenantId.equals(tenantId)) {
            throw new PermissionDeniedException("无权访问该租户监控数据");
        }
    }

    private TimeoutAlertHandleResult escalateTimeoutAlert(TimeoutAlert alert) {
        if ("Y".equals(alert.getResolved())) {
            throw new BusinessException("ALERT_ALREADY_RESOLVED", "已解决告警不能升级");
        }

        if ("Y".equals(alert.getEscalated()) && alert.getEscalatedToId() != null) {
            return buildEscalationResult(alert, "告警已升级");
        }

        SysUser recipient = resolveEscalationRecipient(alert);
        LocalDateTime now = LocalDateTime.now();
        alert.setEscalated("Y");
        alert.setEscalatedToId(recipient.getUserId());
        alert.setEscalatedToName(getDisplayName(recipient));
        alert.setEscalatedTime(now);
        alert.setUpdateTime(now);
        timeoutAlertMapper.updateById(alert);
        performanceStatsRefreshService.refreshForTimeoutAlert(alert);

        notificationService.sendNotification(
                recipient.getUserId(),
                "超时告警升级待办",
                buildEscalationNoticeContent(alert),
                EVENT_TIMEOUT_ALERT_ESCALATED
        );

        log.info("超时告警已升级: alertId={}, escalatedToId={}", alert.getId(), recipient.getUserId());
        return buildEscalationResult(alert, "已升级给 " + alert.getEscalatedToName());
    }

    private TimeoutAlertHandleResult buildEscalationResult(TimeoutAlert alert, String message) {
        String escalatedTime = alert.getEscalatedTime() != null
                ? alert.getEscalatedTime().format(DATE_TIME_FORMATTER)
                : null;
        return new TimeoutAlertHandleResult(
                alert.getId(),
                ACTION_ESCALATE,
                alert.getEscalatedToId(),
                alert.getEscalatedToName(),
                escalatedTime,
                message
        );
    }

    private String buildEscalationNoticeContent(TimeoutAlert alert) {
        long timeoutHours = alert.getTimeoutDuration() == null
                ? 0L
                : Math.max(1L, (long) Math.ceil(alert.getTimeoutDuration() / 3600000.0));
        return String.format(
                "告警「%s」已升级给您处置。类型：%s，级别：%s，目标ID：%s，已超时：%d小时。",
                alert.getTargetName(),
                "TASK".equals(alert.getAlertType()) ? "任务超时" : "流程超时",
                alert.getTimeoutLevel(),
                alert.getTargetId(),
                timeoutHours
        );
    }

    private SysUser resolveEscalationRecipient(TimeoutAlert alert) {
        Long tenantId = alert.getTenantId() != null ? alert.getTenantId() : resolveTenantId();
        Long sourceUserId = resolveEscalationSourceUserId(alert, tenantId);
        SysUser sourceUser = sourceUserId != null ? selectActiveUser(sourceUserId, tenantId) : null;
        SysUser leader = resolveDeptLeader(sourceUser, tenantId);
        if (leader != null) {
            return leader;
        }

        SysUser manager = sourceUser != null && sourceUser.getDeptId() != null
                ? resolveFirstUserByRole("manager", tenantId, sourceUser.getDeptId())
                : null;
        if (manager != null) {
            return manager;
        }

        SysUser admin = resolveFirstUserByRole("admin", tenantId, null);
        if (admin != null) {
            return admin;
        }

        throw new BusinessException("ESCALATION_RECIPIENT_NOT_FOUND", "未找到可接收升级告警的用户");
    }

    private Long resolveEscalationSourceUserId(TimeoutAlert alert, Long tenantId) {
        if ("TASK".equals(alert.getAlertType())) {
            if (alert.getAssigneeId() != null) {
                return alert.getAssigneeId();
            }
            WfTask task = wfTaskMapper.selectById(alert.getTargetId());
            if (task != null && isSameTenant(task.getTenantId(), tenantId)) {
                return task.getAssignee();
            }
            TaskMonitor taskMonitor = taskMonitorMapper.selectByTaskId(alert.getTargetId());
            if (taskMonitor != null && isSameTenant(taskMonitor.getTenantId(), tenantId)) {
                return taskMonitor.getAssigneeId();
            }
            return null;
        }

        if ("PROCESS".equals(alert.getAlertType())) {
            WfProcessInstance instance = processInstanceMapper.selectById(alert.getTargetId());
            if (instance != null && isSameTenant(instance.getTenantId(), tenantId)) {
                return instance.getStartUserId();
            }
            ProcessMonitor monitor = processMonitorMapper.selectByInstanceId(alert.getTargetId(), tenantId);
            return monitor != null ? monitor.getStartUserId() : null;
        }

        return null;
    }

    private SysUser resolveDeptLeader(SysUser sourceUser, Long tenantId) {
        if (sourceUser == null || sourceUser.getDeptId() == null) {
            return null;
        }

        SysDept dept = sysDeptMapper.selectById(sourceUser.getDeptId());
        if (dept != null && isSameTenant(dept.getTenantId(), tenantId)) {
            SysUser leader = resolveLeaderFromDeptField(dept, tenantId);
            if (leader != null) {
                return leader;
            }
        }

        return null;
    }

    private SysUser resolveLeaderFromDeptField(SysDept dept, Long tenantId) {
        if (dept == null || !StringUtils.hasText(dept.getLeader())) {
            return null;
        }

        String leaderValue = dept.getLeader().trim();
        try {
            SysUser leaderById = selectActiveUser(Long.valueOf(leaderValue), tenantId);
            if (leaderById != null) {
                return leaderById;
            }
        } catch (NumberFormatException ignored) {
            // leader 字段兼容 userName / nickName。
        }

        LambdaQueryWrapper<SysUser> wrapper = activeUserWrapper(tenantId)
                .and(query -> query.eq(SysUser::getUserName, leaderValue)
                        .or()
                        .eq(SysUser::getNickName, leaderValue))
                .orderByAsc(SysUser::getUserId)
                .last("LIMIT 1");
        return sysUserMapper.selectOne(wrapper);
    }

    private SysUser resolveFirstUserByRole(String roleKey, Long tenantId, Long preferredDeptId) {
        SysRole role = sysRoleMapper.selectOne(new LambdaQueryWrapper<SysRole>()
                .eq(SysRole::getTenantId, tenantId)
                .eq(SysRole::getRoleKey, roleKey)
                .eq(SysRole::getStatus, "0")
                .eq(SysRole::getDeleted, "0")
                .last("LIMIT 1"));
        if (role == null) {
            return null;
        }

        List<Long> userIds = sysUserRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>()
                        .eq(SysUserRole::getTenantId, tenantId)
                        .eq(SysUserRole::getRoleId, role.getRoleId()))
                .stream()
                .map(SysUserRole::getUserId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (userIds.isEmpty()) {
            return null;
        }

        if (preferredDeptId != null) {
            SysUser deptUser = selectFirstActiveUser(userIds, tenantId, preferredDeptId);
            return deptUser;
        }

        return selectFirstActiveUser(userIds, tenantId, null);
    }

    private SysUser selectFirstActiveUser(List<Long> userIds, Long tenantId, Long deptId) {
        if (userIds == null || userIds.isEmpty()) {
            return null;
        }
        LambdaQueryWrapper<SysUser> wrapper = activeUserWrapper(tenantId)
                .in(SysUser::getUserId, userIds)
                .orderByAsc(SysUser::getUserId)
                .last("LIMIT 1");
        if (deptId != null) {
            wrapper.eq(SysUser::getDeptId, deptId);
        }
        return sysUserMapper.selectOne(wrapper);
    }

    private SysUser selectActiveUser(Long userId, Long tenantId) {
        if (userId == null) {
            return null;
        }
        return sysUserMapper.selectOne(activeUserWrapper(tenantId)
                .eq(SysUser::getUserId, userId)
                .last("LIMIT 1"));
    }

    private LambdaQueryWrapper<SysUser> activeUserWrapper(Long tenantId) {
        return new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getTenantId, tenantId)
                .eq(SysUser::getStatus, "0")
                .eq(SysUser::getDeleted, "0");
    }

    private boolean isSameTenant(Long dataTenantId, Long tenantId) {
        return dataTenantId == null || Objects.equals(dataTenantId, tenantId);
    }

    private Long requireCurrentUserId() {
        Long userId = SecurityUtils.getUserId();
        if (userId == null) {
            throw new PermissionDeniedException("用户未登录");
        }
        return userId;
    }

    private String resolveCurrentUserName() {
        String userName = UserContext.getUserName();
        return StringUtils.hasText(userName) ? userName : String.valueOf(requireCurrentUserId());
    }

    private String getDisplayName(SysUser user) {
        if (user == null) {
            return null;
        }
        return StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName();
    }

    private String resolveTimeoutLevelLabel(String level) {
        return TIMEOUT_LEVEL_LABELS.getOrDefault(level, StringUtils.hasText(level) ? level : "未知");
    }

    private String resolveAnomalyTypeLabel(String type) {
        if (!StringUtils.hasText(type)) {
            return "未知";
        }
        return ANOMALY_TYPE_LABELS.getOrDefault(type, type);
    }

    private String resolveHealthLabel(double successRate, double timeoutInstanceRate, double anomalyInstanceRate,
                                      int totalCount) {
        if (totalCount <= 0) {
            return HEALTH_OBSERVING;
        }
        if (successRate >= 95.0 && timeoutInstanceRate <= 5.0 && anomalyInstanceRate <= 3.0) {
            return HEALTH_STABLE;
        }
        if (successRate >= 85.0 && timeoutInstanceRate <= 12.0 && anomalyInstanceRate <= 8.0) {
            return HEALTH_CONTROLLABLE;
        }
        return HEALTH_WARNING;
    }

    private double roundRate(double numerator, double denominator) {
        if (denominator <= 0) {
            return 0.0;
        }
        return Math.round((numerator * 10000.0) / denominator) / 100.0;
    }

    private double roundScore(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : value;
    }

    private long safeLong(Long value) {
        return value == null ? 0L : value;
    }

    /**
     * 兼容异常告警历史数据。
     * 旧数据里 resolved 可能是 0/1，新数据会统一写为 Y/N。
     */
    private void applyAnomalyResolvedFilter(LambdaQueryWrapper<AnomalyAlert> wrapper, boolean resolved) {
        if (resolved) {
            wrapper.eq(AnomalyAlert::getResolved, "Y");
            return;
        }

        wrapper.eq(AnomalyAlert::getResolved, "N");
    }

    private final class PerformanceAccumulator {

        private String processDefKey;
        private String processName;
        private int totalCount;
        private int completedCount;
        private int failedCount;
        private int timeoutInstanceCount;
        private int timeoutEventCount;
        private int anomalyInstanceCount;
        private int anomalyEventCount;
        private long durationWeightedTotal;
        private int durationSampleCount;
        private long minDurationMs = Long.MAX_VALUE;
        private long maxDurationMs;

        void setProcess(String key, String name) {
            if (!StringUtils.hasText(this.processDefKey) && StringUtils.hasText(key)) {
                this.processDefKey = key;
            }
            if (!StringUtils.hasText(this.processName) && StringUtils.hasText(name)) {
                this.processName = name;
            }
        }

        void add(PerformanceStats row) {
            setProcess(row.getProcessDefKey(), row.getProcessName());
            totalCount += safeInt(row.getTotalCount());
            completedCount += safeInt(row.getCompletedCount());
            failedCount += safeInt(row.getFailedCount());
            timeoutInstanceCount += safeInt(row.getTimeoutInstanceCount());
            timeoutEventCount += safeInt(row.getTimeoutEventCount() != null ? row.getTimeoutEventCount() : row.getTimeoutCount());
            anomalyInstanceCount += safeInt(row.getAnomalyInstanceCount());
            anomalyEventCount += safeInt(row.getAnomalyEventCount() != null ? row.getAnomalyEventCount() : row.getAnomalyCount());

            int rowDurationSamples = safeInt(row.getCompletedCount()) + safeInt(row.getFailedCount());
            long rowAvgDurationMs = safeLong(row.getAvgDurationMs() != null ? row.getAvgDurationMs() : row.getAvgDuration());
            if (rowDurationSamples > 0) {
                durationWeightedTotal += rowAvgDurationMs * rowDurationSamples;
                durationSampleCount += rowDurationSamples;
            }

            long rowMinDurationMs = safeLong(row.getMinDurationMs() != null ? row.getMinDurationMs() : row.getMinDuration());
            if (rowMinDurationMs > 0) {
                minDurationMs = Math.min(minDurationMs, rowMinDurationMs);
            }

            long rowMaxDurationMs = safeLong(row.getMaxDurationMs() != null ? row.getMaxDurationMs() : row.getMaxDuration());
            if (rowMaxDurationMs > 0) {
                maxDurationMs = Math.max(maxDurationMs, rowMaxDurationMs);
            }
        }

        PerformanceDashboardSummary toSummary() {
            double successRate = roundRate(completedCount, totalCount);
            double failedRate = roundRate(failedCount, totalCount);
            double timeoutRate = roundRate(timeoutInstanceCount, totalCount);
            double anomalyRate = roundRate(anomalyInstanceCount, totalCount);

            PerformanceDashboardSummary summary = new PerformanceDashboardSummary();
            summary.setTotalCount(totalCount);
            summary.setCompletedCount(completedCount);
            summary.setFailedCount(failedCount);
            summary.setAvgDurationMs(durationSampleCount > 0 ? durationWeightedTotal / durationSampleCount : 0L);
            summary.setMinDurationMs(minDurationMs == Long.MAX_VALUE ? 0L : minDurationMs);
            summary.setMaxDurationMs(maxDurationMs);
            summary.setSuccessRate(successRate);
            summary.setFailedRate(failedRate);
            summary.setTimeoutInstanceCount(timeoutInstanceCount);
            summary.setTimeoutEventCount(timeoutEventCount);
            summary.setTimeoutInstanceRate(timeoutRate);
            summary.setAnomalyInstanceCount(anomalyInstanceCount);
            summary.setAnomalyEventCount(anomalyEventCount);
            summary.setAnomalyInstanceRate(anomalyRate);
            summary.setHealthLabel(resolveHealthLabel(successRate, timeoutRate, anomalyRate, totalCount));
            return summary;
        }

        PerformanceDashboardTrendPoint toTrendPoint(LocalDate statDate) {
            PerformanceDashboardSummary summary = toSummary();
            PerformanceDashboardTrendPoint trendPoint = new PerformanceDashboardTrendPoint();
            trendPoint.setStatDate(statDate);
            trendPoint.setTotalCount(summary.getTotalCount());
            trendPoint.setCompletedCount(summary.getCompletedCount());
            trendPoint.setFailedCount(summary.getFailedCount());
            trendPoint.setAvgDurationMs(summary.getAvgDurationMs());
            trendPoint.setMinDurationMs(summary.getMinDurationMs());
            trendPoint.setMaxDurationMs(summary.getMaxDurationMs());
            trendPoint.setSuccessRate(summary.getSuccessRate());
            trendPoint.setFailedRate(summary.getFailedRate());
            trendPoint.setTimeoutInstanceCount(summary.getTimeoutInstanceCount());
            trendPoint.setTimeoutEventCount(summary.getTimeoutEventCount());
            trendPoint.setTimeoutInstanceRate(summary.getTimeoutInstanceRate());
            trendPoint.setAnomalyInstanceCount(summary.getAnomalyInstanceCount());
            trendPoint.setAnomalyEventCount(summary.getAnomalyEventCount());
            trendPoint.setAnomalyInstanceRate(summary.getAnomalyInstanceRate());
            trendPoint.setHealthLabel(summary.getHealthLabel());
            return trendPoint;
        }

        PerformanceDashboardProcessRow toProcessRow() {
            PerformanceDashboardSummary summary = toSummary();
            PerformanceDashboardProcessRow processRow = new PerformanceDashboardProcessRow();
            processRow.setProcessDefKey(processDefKey);
            processRow.setProcessName(StringUtils.hasText(processName) ? processName : processDefKey);
            processRow.setTotalCount(summary.getTotalCount());
            processRow.setCompletedCount(summary.getCompletedCount());
            processRow.setFailedCount(summary.getFailedCount());
            processRow.setAvgDurationMs(summary.getAvgDurationMs());
            processRow.setMinDurationMs(summary.getMinDurationMs());
            processRow.setMaxDurationMs(summary.getMaxDurationMs());
            processRow.setSuccessRate(summary.getSuccessRate());
            processRow.setFailedRate(summary.getFailedRate());
            processRow.setTimeoutInstanceCount(summary.getTimeoutInstanceCount());
            processRow.setTimeoutEventCount(summary.getTimeoutEventCount());
            processRow.setTimeoutInstanceRate(summary.getTimeoutInstanceRate());
            processRow.setAnomalyInstanceCount(summary.getAnomalyInstanceCount());
            processRow.setAnomalyEventCount(summary.getAnomalyEventCount());
            processRow.setAnomalyInstanceRate(summary.getAnomalyInstanceRate());
            processRow.setHealthLabel(summary.getHealthLabel());
            processRow.setRiskScore(roundScore(
                    summary.getFailedRate() + summary.getTimeoutInstanceRate() + summary.getAnomalyInstanceRate()
            ));
            return processRow;
        }
    }
}

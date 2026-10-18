package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.hr.domain.dto.HrLeaveQuotaPayload;
import com.cloudflow.hr.domain.dto.HrTimeRequestPayload;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrLeaveLedger;
import com.cloudflow.hr.domain.entity.HrLeavePeriod;
import com.cloudflow.hr.domain.entity.HrLeavePolicyAssignment;
import com.cloudflow.hr.domain.entity.HrLeavePolicyDetail;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.domain.entity.HrTimeRequest;
import com.cloudflow.hr.domain.entity.HrOvertimeRequest;
import com.cloudflow.hr.domain.entity.HrEarnedLeaveSchedule;
import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.dto.BusinessRuleDTO;
import com.cloudflow.hr.client.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.mapper.HrFileStorageMapper;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLeaveLedgerMapper;
import com.cloudflow.hr.mapper.HrLeavePeriodMapper;
import com.cloudflow.hr.mapper.HrEarnedLeaveScheduleMapper;
import com.cloudflow.hr.mapper.HrLeavePolicyAssignmentMapper;
import com.cloudflow.hr.mapper.HrLeavePolicyDetailMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrLeaveTypeMapper;
import com.cloudflow.hr.mapper.HrTimeRequestMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.LinkedHashMap;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;

import static com.cloudflow.hr.service.HrRuleSupport.flag;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrLeaveBusinessService {

    private static final long DEFAULT_TENANT_ID = 100000L;
    private static final BigDecimal HALF = new BigDecimal("0.5");

    private final HrLeaveTypeMapper leaveTypeMapper;
    private final HrLeaveEncashmentComponentService encashmentComponents;
    private final HrRuleWorkflowService workflowService;
    private final HrLeaveQuotaMapper leaveQuotaMapper;
    private final HrLeaveLedgerMapper leaveLedgerMapper;
    private final HrLeavePeriodMapper leavePeriodMapper;
    private final HrLeavePolicyAssignmentMapper policyAssignmentMapper;
    private final HrLeavePolicyDetailMapper policyDetailMapper;
    private final HrEarnedLeaveScheduleMapper earnedLeaveScheduleMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrTimeRequestMapper timeRequestMapper;
    private final HolidayCalendarService holidayCalendarService;
    private final HrTypedCrudService crudService;
    private final RedissonClient redissonClient;
    private final HrRuleSupport support;
    private final BusinessRuleClient businessRuleClient;
    private final HrFileStorageMapper fileStorageMapper;
    private final HrRuleProofService proofService;
    private final HrLeaveDayCalculator dayCalculator;
    private final com.cloudflow.hr.mapper.HrHMapper hMapper;

    public List<HrLeaveQuota> ownQuotas(Long employeeId) {
        assertSelfServiceEmployee(employeeId);
        return leaveQuotaMapper.selectList(new LambdaQueryWrapper<HrLeaveQuota>()
                .eq(HrLeaveQuota::getTenantId, tenantId())
                .eq(HrLeaveQuota::getEmployeeId, employeeId)
                .eq(HrLeaveQuota::getDeleted, 0)
                .orderByDesc(HrLeaveQuota::getUpdateTime)
                .orderByDesc(HrLeaveQuota::getId));
    }

    public List<HrTimeRequest> ownRequests(Long employeeId) {
        assertSelfServiceEmployee(employeeId);
        return timeRequestMapper.selectList(new LambdaQueryWrapper<HrTimeRequest>()
                .eq(HrTimeRequest::getTenantId, tenantId())
                .eq(HrTimeRequest::getEmployeeId, employeeId)
                .eq(HrTimeRequest::getRequestType, "LEAVE")
                .eq(HrTimeRequest::getDeleted, 0)
                .orderByDesc(HrTimeRequest::getUpdateTime)
                .orderByDesc(HrTimeRequest::getId));
    }

    private void assertSelfServiceEmployee(Long employeeId) {
        Long userId = UserContext.getUserId();
        if (userId == null) throw new HrBusinessException("UNAUTHORIZED", "当前登录态缺失，无法解析员工身份");
        HrEmployee employee = getEmployee(employeeId);
        if (!Objects.equals(employee.getUserId(), userId)) {
            throw new HrBusinessException("FORBIDDEN_CROSS_EMPLOYEE", "员工自助仅可查看本人假期数据");
        }
    }

    public Long submit(HrTimeRequestPayload payload) {
        validateRequestPayload(payload);
        support.assertEmployeeScope(payload.getEmployeeId());
        return support.locked("attendance-config", () -> support.locked("leave:" + payload.getEmployeeId() + ":" + payload.getLeaveTypeId(), () -> {
            if (hMapper.shiftOverlap(tenantId(), payload.getEmployeeId(), null, payload.getStartTime().toLocalDate().minusDays(1), payload.getEndTime().toLocalDate()) > 0
                    || hMapper.overtimeOverlap(tenantId(), payload.getEmployeeId(), null, payload.getStartTime(), payload.getEndTime()) > 0) {
                throw new HrBusinessException("H_ATTENDANCE_CONFLICT", "请假时段存在待处理调班或已占用加班申请");
            }
            HrLeaveType leaveType = getLeaveType(payload.getLeaveTypeId());
            HrEmployee employee = getEmployee(payload.getEmployeeId());
            BigDecimal calculated = calculateAndValidate(employee, leaveType, payload.getStartTime(),
                    payload.getEndTime(), payload.getReason());
            Map<Long, BigDecimal> quantities = periodQuantities(employee.getId(), leaveType,
                    payload.getStartTime(), payload.getEndTime(), calculated);
            List<Long> files = payload.getAttachmentFileIds() == null ? List.of()
                    : payload.getAttachmentFileIds().stream().filter(Objects::nonNull).distinct().toList();
            if (files.size() > 10 || !files.isEmpty() && fileStorageMapper.countOwnedLeaveFiles(tenantId(), currentUserName(), files) != files.size()) {
                throw new HrBusinessException("INVALID_ATTACHMENT", "请假附件不存在或无权使用");
            }
            checkRule("hr.leave.attachment.required", typeFlag(leaveType.getNeedAttachmentFlag()) && files.isEmpty(),
                    employee.getId(), BigDecimal.ONE, BigDecimal.valueOf(files.size()), "该假期必须提供附件");
            for (Map.Entry<Long, BigDecimal> entry : quantities.entrySet()) {
                assertSubmissionRules(employee, leaveType, getPeriod(entry.getKey()), entry.getValue(), payload);
                if (isQuotaRequired(leaveType)) assertAvailable(employee.getId(), leaveType, entry.getKey(), entry.getValue());
            }
            if (payload.getDuration() != null && payload.getDuration().compareTo(calculated) != 0) {
                log.warn("请假时长以服务端计算为准 employeeId={}, client={}, calculated={}",
                        employee.getId(), payload.getDuration(), calculated);
            }
            payload.setDuration(calculated);
            payload.setUnit(leaveType.getUnit());
            payload.setStatus("PENDING");
            payload.setRequestType("LEAVE");
            payload.setProcessInstanceId(null);
            payload.setRequestNo("LV" + java.util.UUID.randomUUID().toString().replace("-", ""));
            Long requestId = crudService.create(HrTimeRequest.class, support.configurationPayload(payload, "id"));
            if (isQuotaRequired(leaveType)) {
                for (Map.Entry<Long, BigDecimal> entry : quantities.entrySet()) {
                    writeLedger(employee.getId(), leaveType, entry.getKey(), "FREEZE", entry.getValue().negate(),
                            requestId, payload.getStartTime().toLocalDate(), payload.getEndTime().toLocalDate(), "审批冻结");
                    syncQuota(employee.getId(), leaveType.getId(), entry.getKey());
                }
            }
            support.audit("TIME_REQUEST", requestId, "LEAVE_SUBMIT", Map.of(
                    "duration", calculated, "periodQuantities", quantities, "attachmentFileIds", files,
                    "quotaRequired", isQuotaRequired(leaveType), "unit", leaveType.getUnit(),
                    "lwpFlag", typeFlag(leaveType.getLwpFlag()), "partialPaidFlag", typeFlag(leaveType.getPartialPaidFlag()),
                    "salaryFractionPerDay", leaveType.getSalaryFractionPerDay() == null ? BigDecimal.ONE : leaveType.getSalaryFractionPerDay(),
                    "paidFlag", !Integer.valueOf(0).equals(leaveType.getIsPaid()), "includeHolidayFlag", typeFlag(leaveType.getIncludeHolidayFlag())));
            workflowService.enqueue("HR_TIME_REQUEST", requestId, payload.getRequestNo(), "请假申请-" + employee.getName(),
                    Map.of("employeeId", employee.getId(), "leaveTypeId", leaveType.getId(), "duration", calculated, "unit", leaveType.getUnit(), "attachmentFileIds", files));
            return requestId;
        }));
    }

    public BigDecimal calculate(Long employeeId, Long leaveTypeId, LocalDateTime startTime,
                                LocalDateTime endTime) {
        support.assertEmployeeScope(employeeId);
        HrEmployee employee = getEmployee(employeeId);
        return calculateAndValidate(employee, getLeaveType(leaveTypeId), startTime, endTime, null);
    }

    public List<Map<String, Object>> attachments(Long requestId) {
        HrTimeRequest request = loadRequest(requestId);
        support.assertEmployeeScope(request.getEmployeeId());
        Object values = support.auditDetail("TIME_REQUEST", requestId, "LEAVE_SUBMIT").get("attachmentFileIds");
        if (!(values instanceof List<?> files)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object value : files) {
            Long fileId = Long.valueOf(value.toString());
            Map<String, Object> metadata = fileStorageMapper.selectFileMetadata(fileId, tenantId());
            if (metadata != null && "HR_LEAVE_PROOF".equals(metadata.get("fileType"))) {
                result.add(Map.of("fileId", fileId, "fileName", metadata.get("fileName")));
            }
        }
        support.audit("TIME_REQUEST", requestId, "VIEW_ATTACHMENTS", Map.of("count", result.size()));
        return result;
    }

    public org.springframework.http.ResponseEntity<byte[]> downloadAttachment(Long requestId, Long fileId) {
        if (attachments(requestId).stream().noneMatch(file -> Objects.equals(file.get("fileId"), fileId))) {
            throw new HrBusinessException("FORBIDDEN", "无权访问该请假附件");
        }
        return proofService.download("hr-file:HR_LEAVE_PROOF:" + fileId, "HR_LEAVE_PROOF");
    }

    public void withRequestLock(Long requestId, Runnable action) {
        HrTimeRequest request = loadRequest(requestId);
        support.locked("leave:" + request.getEmployeeId() + ":" + request.getLeaveTypeId(), () -> { action.run(); return null; });
    }

    public void onApproval(Long requestId, String approvalResult) {
        HrTimeRequest request = loadRequest(requestId);
        if (!"LEAVE".equalsIgnoreCase(request.getRequestType()) || request.getLeaveTypeId() == null) {
            return;
        }
        withLock(request.getEmployeeId(), request.getLeaveTypeId(), () -> {
            HrLeaveType leaveType = getLeaveType(request.getLeaveTypeId(), false);
            Map<String, Object> snapshot = support.auditDetail("TIME_REQUEST", requestId, "LEAVE_SUBMIT");
            leaveType.setUnit(request.getUnit());
            if (snapshot.containsKey("lwpFlag")) leaveType.setLwpFlag(Boolean.TRUE.equals(snapshot.get("lwpFlag")) ? 1 : 0);
            List<HrLeaveLedger> freezes = requestFreezes(requestId);
            if (freezes.isEmpty() && "APPROVED".equalsIgnoreCase(approvalResult)) {
                if (!Boolean.FALSE.equals(snapshot.get("quotaRequired")) || !(snapshot.get("periodQuantities") instanceof Map<?, ?> quantities)) {
                    throw new HrBusinessException("LEAVE_SNAPSHOT_MISSING", "请假缺少冻结记录或提交快照，请先核对原申请");
                }
                for (Map.Entry<?, ?> entry : quantities.entrySet()) {
                    Long periodId = Long.valueOf(entry.getKey().toString());
                    if (sourceExists(requestId, "APPLICATION", periodId)) continue;
                    writeLedger(request.getEmployeeId(), leaveType, periodId, "APPLICATION",
                            new BigDecimal(entry.getValue().toString()).negate(), requestId,
                            request.getStartTime().toLocalDate(), request.getEndTime().minusNanos(1).toLocalDate(), "无额度假期审批登记");
                    syncQuota(request.getEmployeeId(), leaveType.getId(), periodId);
                }
            }
            for (HrLeaveLedger frozen : freezes) {
                if (sourceExists(requestId, "UNFREEZE", frozen.getLeavePeriodId())) continue;
                leaveType.setUnit(frozen.getQuantityUnit());
                leaveType.setLwpFlag(frozen.getLwpFlag());
                BigDecimal quantity = frozen.getLeaveDays().abs();
                if ("APPROVED".equalsIgnoreCase(approvalResult)) {
                    writeLedger(request.getEmployeeId(), leaveType, frozen.getLeavePeriodId(), "APPLICATION",
                            quantity.negate(), requestId, frozen.getFromDate(), frozen.getToDate(), "审批通过扣减");
                } else if (!"REJECTED".equalsIgnoreCase(approvalResult)) continue;
                writeLedger(request.getEmployeeId(), leaveType, frozen.getLeavePeriodId(), "UNFREEZE",
                        quantity, requestId, frozen.getFromDate(), frozen.getToDate(), "审批完成释放冻结");
                syncQuota(request.getEmployeeId(), leaveType.getId(), frozen.getLeavePeriodId());
            }
        });
    }

    @Audit(name = "撤回请假申请", spel = "#requestId", highRisk = true)
    public void revoke(Long requestId) {
        HrTimeRequest request = loadRequest(requestId);
        support.assertEmployeeScope(request.getEmployeeId());
        withLock(request.getEmployeeId(), request.getLeaveTypeId(), () -> {
        HrTimeRequest latest = loadRequest(requestId);
        if (!List.of("PENDING", "SUBMITTED", "APPROVING", "APPLYING").contains(
                upper(latest.getStatus()))) {
            throw new HrBusinessException("LEAVE_REVOKE_NOT_ALLOWED", "当前状态不可撤回");
        }
        if ("LEAVE".equalsIgnoreCase(latest.getRequestType())) onApproval(requestId, "REJECTED");
        workflowService.cancel("HR_TIME_REQUEST", requestId);
        timeRequestMapper.update(null, new LambdaUpdateWrapper<HrTimeRequest>()
                .eq(HrTimeRequest::getId, requestId)
                .eq(HrTimeRequest::getTenantId, tenantId())
                .set(HrTimeRequest::getStatus, "CANCELLED")
                .set(HrTimeRequest::getUpdateBy, currentUserName())
                .set(HrTimeRequest::getUpdateTime, LocalDateTime.now()));
        support.audit("TIME_REQUEST", requestId, "LEAVE_REVOKE", Map.of());
        });
    }

    public Long createQuota(HrLeaveQuotaPayload payload) {
        if (payload == null || payload.getEmployeeId() == null || payload.getLeaveTypeId() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "员工和假期类型不能为空");
        }
        support.assertEmployeeScope(payload.getEmployeeId());
        return support.locked("leave:" + payload.getEmployeeId() + ":" + payload.getLeaveTypeId(), () -> {
        HrLeaveType type = getLeaveType(payload.getLeaveTypeId());
        HrLeavePeriod period = payload.getPeriodId() == null
                ? findPeriod(LocalDate.now()) : getPeriod(payload.getPeriodId());
        BigDecimal total = scale(payload.getTotalQuota());
        if (findQuota(payload.getEmployeeId(), type.getId(), period.getPeriodId()) != null) {
            throw new HrBusinessException("QUOTA_EXISTS", "该员工的周期额度已存在，请使用调整功能");
        }
        assertAllocation(type, BigDecimal.ZERO, total);
        if (total.signum() != 0) {
            adjustLocked(payload.getEmployeeId(), type, period.getPeriodId(), total, null,
                    "手工创建额度");
        }
        syncQuota(payload.getEmployeeId(), type.getId(), period.getPeriodId());
        Long quotaId = findQuota(payload.getEmployeeId(), type.getId(), period.getPeriodId()).getId();
        support.audit("LEAVE_QUOTA", quotaId, "ADJUSTMENT", Map.of("quantity", total));
        return quotaId;
        });
    }

    public void updateQuota(Long quotaId, HrLeaveQuotaPayload payload) {
        HrLeaveQuota current = leaveQuotaMapper.selectById(quotaId);
        if (current == null || !Objects.equals(current.getTenantId(), tenantId())) {
            throw new HrBusinessException("QUOTA_NOT_FOUND", "假期额度不存在");
        }
        if (payload == null || payload.getTotalQuota() == null) throw new HrBusinessException("INVALID_PARAMETER", "目标额度不能为空");
        support.assertEmployeeScope(current.getEmployeeId());
        withLock(current.getEmployeeId(), current.getLeaveTypeId(), () -> {
        HrLeaveQuota fresh = calculateQuota(current.getEmployeeId(), current.getLeaveTypeId(), current.getPeriodId());
        BigDecimal target = scale(payload.getTotalQuota());
        BigDecimal delta = target.subtract(scale(fresh.getTotalQuota()));
        assertAllocation(getLeaveType(current.getLeaveTypeId()), BigDecimal.ZERO, target);
        if (delta.signum() != 0) {
            HrLeaveType type = getLeaveType(current.getLeaveTypeId());
            adjustLocked(current.getEmployeeId(), type, current.getPeriodId(), delta, quotaId,
                    "手工调整额度");
        }
        syncQuota(current.getEmployeeId(), current.getLeaveTypeId(), current.getPeriodId());
        support.audit("LEAVE_QUOTA", quotaId, "ADJUSTMENT", Map.of("quantity", delta, "target", target));
        });
    }

    public int recalculate(Long employeeId, Long leaveTypeId) {
        if (employeeId != null) support.assertEmployeeScope(employeeId);
        java.util.Set<Long> allowed = support.employees(employeeId == null ? null : List.of(employeeId), null)
                .stream().map(HrEmployee::getId).collect(java.util.stream.Collectors.toSet());
        List<QuotaKey> groups = quotaKeys().stream().filter(key -> allowed.contains(key.employeeId())
                && (leaveTypeId == null || leaveTypeId.equals(key.leaveTypeId()))).toList();
        for (QuotaKey key : groups) {
            withLock(key.employeeId(), key.leaveTypeId(), () -> syncQuota(key.employeeId(), key.leaveTypeId(), key.periodId()));
        }
        support.audit("LEAVE_QUOTA", employeeId, "RECALCULATE", Map.of("affected", groups.size()));
        return groups.size();
    }

    public int allocatePolicies(LocalDate allocationDate) {
        LocalDate date = allocationDate == null ? LocalDate.now() : allocationDate;
        List<HrLeavePolicyAssignment> assignments = policyAssignmentMapper.selectList(
                new LambdaQueryWrapper<HrLeavePolicyAssignment>()
                        .eq(HrLeavePolicyAssignment::getTenantId, tenantId())
                        .eq(HrLeavePolicyAssignment::getDeleted, 0).eq(HrLeavePolicyAssignment::getStatus, "ACTIVE")
                        .eq(HrLeavePolicyAssignment::getAllocatedFlag, 0)
                        .le(HrLeavePolicyAssignment::getEffectiveFrom, date)
                        .orderByAsc(HrLeavePolicyAssignment::getEmployeeId)
                        .orderByAsc(HrLeavePolicyAssignment::getAssignmentId));
        int allocated = 0;
        for (HrLeavePolicyAssignment assignment : assignments) {
            allocated += support.locked("leave-policy:" + assignment.getEmployeeId() + ":" + assignment.getLeavePeriodId(), () -> {
                HrLeavePolicyAssignment current = policyAssignmentMapper.selectById(assignment.getAssignmentId());
                if (typeFlag(current.getAllocatedFlag())) return 0;
                HrLeavePeriod period = getPeriod(current.getLeavePeriodId());
                if (!"OPEN".equals(period.getStatus())) throw new HrBusinessException("PERIOD_CLOSED", "已关闭的周期不能分配假期");
                List<HrLeavePolicyDetail> details = policyDetailMapper.selectList(new LambdaQueryWrapper<HrLeavePolicyDetail>()
                        .eq(HrLeavePolicyDetail::getTenantId, tenantId()).eq(HrLeavePolicyDetail::getPolicyId, current.getPolicyId())
                        .eq(HrLeavePolicyDetail::getDeleted, 0).orderByAsc(HrLeavePolicyDetail::getLeaveTypeId));
                if (details.isEmpty()) throw new HrBusinessException("EMPTY_LEAVE_POLICY", "假期政策尚未配置明细");
                for (HrLeavePolicyDetail detail : details) {
                    HrLeaveType type = getLeaveType(detail.getLeaveTypeId());
                    BigDecimal quantity = prorate(detail.getAnnualDays(), current.getEmployeeId(), period, current.getAssignmentBasis());
                    assertAllocation(type, BigDecimal.ZERO, quantity);
                    if (typeFlag(type.getEarnedLeaveFlag())) createEarnedSchedule(current, type, period, quantity);
                    else if (quantity.signum() > 0) allocateLocked(current.getEmployeeId(), type, period.getPeriodId(), quantity,
                            current.getAssignmentId(), "POLICY_ASSIGNMENT", current.getEffectiveFrom(), current.getEffectiveTo(), "政策分配");
                }
                policyAssignmentMapper.update(null, new LambdaUpdateWrapper<HrLeavePolicyAssignment>()
                        .eq(HrLeavePolicyAssignment::getAssignmentId, current.getAssignmentId())
                        .eq(HrLeavePolicyAssignment::getTenantId, tenantId()).set(HrLeavePolicyAssignment::getAllocatedFlag, 1));
                support.audit("LEAVE_POLICY", current.getAssignmentId(), "ALLOCATE", Map.of("employeeId", current.getEmployeeId()));
                return details.size();
            });
        }
        return allocated;
    }

    private void createEarnedSchedule(HrLeavePolicyAssignment assignment, HrLeaveType type,
                                     HrLeavePeriod period, BigDecimal quantity) {
        int months = switch (upper(type.getEarnedLeaveFrequency())) {
            case "MONTHLY" -> 1;
            case "QUARTERLY" -> 3;
            case "HALF_YEARLY" -> 6;
            case "YEARLY" -> 12;
            default -> throw new HrBusinessException("INVALID_ACCRUAL_FREQUENCY", "请配置有效的假期累积频率");
        };
        List<LocalDate> dueDates = new ArrayList<>();
        LocalDate effectiveEnd = assignment.getEffectiveTo() == null || assignment.getEffectiveTo().isAfter(period.getEndDate())
                ? period.getEndDate() : assignment.getEffectiveTo();
        for (LocalDate due = period.getStartDate(); !due.isAfter(effectiveEnd); due = due.plusMonths(months)) {
            LocalDate blockEnd = due.plusMonths(months).minusDays(1);
            if (blockEnd.isBefore(assignment.getEffectiveFrom())) continue;
            dueDates.add(due.isBefore(assignment.getEffectiveFrom()) ? assignment.getEffectiveFrom() : due);
        }
        BigDecimal assigned = BigDecimal.ZERO;
        for (int index = 0; index < dueDates.size(); index++) {
            BigDecimal cumulative = index == dueDates.size() - 1 ? quantity : round(quantity
                    .multiply(BigDecimal.valueOf(index + 1)).divide(BigDecimal.valueOf(dueDates.size()), 8, RoundingMode.HALF_UP),
                    type.getRoundingMode()).min(quantity);
            BigDecimal earned = scale(cumulative.subtract(assigned));
            assigned = cumulative;
            if (earned.signum() <= 0) continue;
            LocalDate scheduleDate = dueDates.get(index);
            withLock(assignment.getEmployeeId(), type.getId(), () -> {
                if (earnedLeaveScheduleMapper.selectCount(new LambdaQueryWrapper<HrEarnedLeaveSchedule>()
                        .eq(HrEarnedLeaveSchedule::getTenantId, tenantId()).eq(HrEarnedLeaveSchedule::getEmployeeId, assignment.getEmployeeId())
                        .eq(HrEarnedLeaveSchedule::getLeaveTypeId, type.getId()).eq(HrEarnedLeaveSchedule::getLeavePeriodId, period.getPeriodId())
                        .eq(HrEarnedLeaveSchedule::getScheduleDate, scheduleDate)) > 0) return;
                HrEarnedLeaveSchedule schedule = new HrEarnedLeaveSchedule();
                schedule.setTenantId(tenantId());
                schedule.setEmployeeId(assignment.getEmployeeId());
                schedule.setLeaveTypeId(type.getId());
                schedule.setLeavePeriodId(period.getPeriodId());
                schedule.setScheduleDate(scheduleDate);
                schedule.setEarnedDays(earned);
                schedule.setExecutedFlag(0);
                schedule.setCreateBy(currentUserName());
                schedule.setCreateTime(LocalDateTime.now());
                earnedLeaveScheduleMapper.insert(schedule);
            });
        }
    }

    public int accrueEarnedLeave(LocalDate runDate) {
        LocalDate date = runDate == null ? LocalDate.now() : runDate;
        allocatePolicies(date);
        List<HrEarnedLeaveSchedule> schedules = earnedLeaveScheduleMapper.selectList(new LambdaQueryWrapper<HrEarnedLeaveSchedule>()
                .eq(HrEarnedLeaveSchedule::getTenantId, tenantId()).eq(HrEarnedLeaveSchedule::getExecutedFlag, 0)
                .le(HrEarnedLeaveSchedule::getScheduleDate, date).orderByAsc(HrEarnedLeaveSchedule::getScheduleDate)
                .orderByAsc(HrEarnedLeaveSchedule::getEmployeeId));
        int count = 0;
        for (HrEarnedLeaveSchedule schedule : schedules) {
            count += support.locked("leave:" + schedule.getEmployeeId() + ":" + schedule.getLeaveTypeId(), () -> {
                HrEarnedLeaveSchedule current = earnedLeaveScheduleMapper.selectById(schedule.getScheduleId());
                if (typeFlag(current.getExecutedFlag())) return 0;
                HrLeavePeriod period = getPeriod(current.getLeavePeriodId());
                if (!"OPEN".equals(period.getStatus())) throw new HrBusinessException("PERIOD_CLOSED", "存在已关闭周期的未执行累积记录");
                HrLeaveType type = getLeaveType(current.getLeaveTypeId());
                allocateLocked(current.getEmployeeId(), type, current.getLeavePeriodId(), current.getEarnedDays(),
                        current.getScheduleId(), "HR_EARNED_LEAVE", current.getScheduleDate(), period.getEndDate(), "按期累积假期");
                List<HrLeaveLedger> entries = leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                        .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getSourceBizType, "HR_EARNED_LEAVE")
                        .eq(HrLeaveLedger::getSourceBizId, current.getScheduleId().toString())
                        .eq(HrLeaveLedger::getEmployeeId, current.getEmployeeId()).eq(HrLeaveLedger::getLeaveTypeId, current.getLeaveTypeId()));
                earnedLeaveScheduleMapper.update(null, new LambdaUpdateWrapper<HrEarnedLeaveSchedule>()
                        .eq(HrEarnedLeaveSchedule::getScheduleId, current.getScheduleId()).eq(HrEarnedLeaveSchedule::getTenantId, tenantId())
                        .set(HrEarnedLeaveSchedule::getExecutedFlag, 1).set(HrEarnedLeaveSchedule::getLedgerId, entries.get(0).getLedgerId())
                        .set(HrEarnedLeaveSchedule::getUpdateTime, LocalDateTime.now()));
                return 1;
            });
        }
        return count;
    }

    public int carryForward(LocalDate runDate) {
        LocalDate date = runDate == null ? LocalDate.now() : runDate;
        List<HrLeavePeriod> periods = leavePeriodMapper.selectList(new LambdaQueryWrapper<HrLeavePeriod>()
                .eq(HrLeavePeriod::getTenantId, tenantId()).eq(HrLeavePeriod::getDeleted, 0)
                .eq(HrLeavePeriod::getStatus, "OPEN").lt(HrLeavePeriod::getEndDate, date)
                .orderByAsc(HrLeavePeriod::getStartDate));
        int count = 0;
        for (HrLeavePeriod period : periods) {
            List<HrLeavePeriod> nextPeriods = leavePeriodMapper.selectList(new LambdaQueryWrapper<HrLeavePeriod>()
                    .eq(HrLeavePeriod::getTenantId, tenantId()).eq(HrLeavePeriod::getDeleted, 0)
                    .eq(HrLeavePeriod::getStatus, "OPEN").eq(HrLeavePeriod::getStartDate, period.getEndDate().plusDays(1)));
            if (nextPeriods.size() != 1) {
                log.warn("假期结转等待唯一的下一周期 tenantId={}, periodId={}", tenantId(), period.getPeriodId());
                continue;
            }
            HrLeavePeriod next = nextPeriods.get(0);
            List<HrLeaveQuota> quotas = leaveQuotaMapper.selectList(new LambdaQueryWrapper<HrLeaveQuota>()
                    .eq(HrLeaveQuota::getTenantId, tenantId()).eq(HrLeaveQuota::getPeriodId, period.getPeriodId())
                    .eq(HrLeaveQuota::getDeleted, 0).orderByAsc(HrLeaveQuota::getEmployeeId).orderByAsc(HrLeaveQuota::getLeaveTypeId));
            for (HrLeaveQuota quota : quotas) {
                count += support.locked("leave:" + quota.getEmployeeId() + ":" + quota.getLeaveTypeId(), () -> {
                    for (Long periodId : List.of(period.getPeriodId(), next.getPeriodId()).stream().distinct().sorted().toList()) {
                        HrLeavePeriod lockedPeriod = leavePeriodMapper.selectLocked(periodId, tenantId());
                        if (lockedPeriod == null || !"OPEN".equals(lockedPeriod.getStatus()) || flag(lockedPeriod.getDeleted())) throw new HrBusinessException("PERIOD_CLOSED", "结转涉及的假期周期已关闭或失效");
                    }
                    if (hMapper.pendingLeave(tenantId(), period.getPeriodId()) > 0) throw new HrBusinessException("OVERTIME_SETTLEMENT_PENDING", "假期周期存在未结算加班调休，不能结转");
                    HrLeaveQuota balance = calculateQuota(quota.getEmployeeId(), quota.getLeaveTypeId(), period.getPeriodId());
                    if (balance.getFrozenQuota().signum() > 0) return 0;
                    BigDecimal available = balance.getAvailableQuota().max(BigDecimal.ZERO);
                    if (available.signum() == 0) return 0;
                    HrLeaveType type = getLeaveType(quota.getLeaveTypeId(), false);
                    BigDecimal carried = typeFlag(type.getCarryForwardFlag()) ? available : BigDecimal.ZERO;
                    List<HrLeavePolicyAssignment> assignments = policyAssignmentMapper.selectList(new LambdaQueryWrapper<HrLeavePolicyAssignment>()
                            .eq(HrLeavePolicyAssignment::getTenantId, tenantId()).eq(HrLeavePolicyAssignment::getEmployeeId, quota.getEmployeeId())
                            .eq(HrLeavePolicyAssignment::getLeavePeriodId, period.getPeriodId()).eq(HrLeavePolicyAssignment::getDeleted, 0));
                    if (!assignments.isEmpty() && assignments.stream().noneMatch(assignment -> typeFlag(assignment.getCarryForwardFlag()))) {
                        carried = BigDecimal.ZERO;
                    }
                    if (type.getMaxCarryForwardDays() != null) carried = carried.min(type.getMaxCarryForwardDays());
                    String sourceId = period.getPeriodId() + ":" + next.getPeriodId() + ":" + quota.getEmployeeId() + ":" + type.getId();
                    if (carried.signum() > 0) {
                        LocalDate expiry = type.getCarryForwardExpireDays() == null ? next.getEndDate()
                                : next.getStartDate().plusDays(type.getCarryForwardExpireDays()).minusDays(1);
                        if (expiry.isAfter(next.getEndDate())) expiry = next.getEndDate();
                        writeLedgerToPeriod(quota.getEmployeeId(), type, period.getPeriodId(), "CARRY_FORWARD", carried.negate(),
                                sourceId, period.getStartDate(), period.getEndDate(), "转出至下一周期");
                        writeLedgerToPeriod(quota.getEmployeeId(), type, next.getPeriodId(), "CARRY_FORWARD", carried,
                                sourceId, next.getStartDate(), expiry, "上期额度结转");
                        syncQuota(quota.getEmployeeId(), type.getId(), next.getPeriodId());
                    }
                    BigDecimal expired = available.subtract(carried);
                    if (expired.signum() > 0) writeLedgerToPeriod(quota.getEmployeeId(), type, period.getPeriodId(), "EXPIRY",
                            expired.negate(), sourceId, period.getStartDate(), period.getEndDate(), "周期结束未结转额度作废");
                    syncQuota(quota.getEmployeeId(), type.getId(), period.getPeriodId());
                    return 1;
                });
            }
            support.transaction(() -> {
                HrLeavePeriod locked = leavePeriodMapper.selectLocked(period.getPeriodId(), tenantId());
                if (hMapper.pendingLeave(tenantId(), period.getPeriodId()) > 0) throw new HrBusinessException("OVERTIME_SETTLEMENT_PENDING", "假期周期存在未结算加班调休，不能关闭");
                List<HrLeaveQuota> balances = leaveQuotaMapper.selectList(new LambdaQueryWrapper<HrLeaveQuota>()
                        .eq(HrLeaveQuota::getTenantId, tenantId()).eq(HrLeaveQuota::getPeriodId, period.getPeriodId())
                        .eq(HrLeaveQuota::getDeleted, 0));
                boolean pending = balances.stream().anyMatch(balance -> scale(balance.getFrozenQuota()).signum() > 0
                        || scale(balance.getAvailableQuota()).signum() > 0);
                long scheduled = earnedLeaveScheduleMapper.selectCount(new LambdaQueryWrapper<HrEarnedLeaveSchedule>()
                        .eq(HrEarnedLeaveSchedule::getTenantId, tenantId()).eq(HrEarnedLeaveSchedule::getLeavePeriodId, period.getPeriodId())
                        .eq(HrEarnedLeaveSchedule::getExecutedFlag, 0));
                if (locked != null && !pending && scheduled == 0) leavePeriodMapper.update(null, new LambdaUpdateWrapper<HrLeavePeriod>()
                        .eq(HrLeavePeriod::getTenantId, tenantId()).eq(HrLeavePeriod::getPeriodId, period.getPeriodId())
                        .set(HrLeavePeriod::getStatus, "CLOSED"));
                return null;
            });
        }
        return count;
    }

    public int expireCarryForward(LocalDate runDate) {
        LocalDate date = runDate == null ? LocalDate.now() : runDate;
        List<HrLeaveLedger> credits = leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getTransactionType, "CARRY_FORWARD")
                .gt(HrLeaveLedger::getLeaveDays, BigDecimal.ZERO).lt(HrLeaveLedger::getToDate, date)
                .orderByAsc(HrLeaveLedger::getToDate).orderByAsc(HrLeaveLedger::getLedgerId));
        int count = 0;
        for (HrLeaveLedger credit : credits) {
            count += support.locked("leave:" + credit.getEmployeeId() + ":" + credit.getLeaveTypeId(), () -> {
                List<HrLeaveLedger> rows = periodLedger(credit.getEmployeeId(), credit.getLeaveTypeId(), credit.getLeavePeriodId());
                BigDecimal remaining = remainingCredit(rows, credit.getLedgerId());
                if (remaining.signum() <= 0) return 0;
                writeLedgerToPeriod(credit.getEmployeeId(), getLeaveType(credit.getLeaveTypeId(), false), credit.getLeavePeriodId(), "EXPIRY",
                        remaining.negate(), credit.getLedgerId().toString(), credit.getFromDate(), credit.getToDate(), "未使用结转额度到期作废", "LEAVE_LEDGER");
                syncQuota(credit.getEmployeeId(), credit.getLeaveTypeId(), credit.getLeavePeriodId());
                return 1;
            });
        }
        return count;
    }

    static BigDecimal remainingCredit(List<HrLeaveLedger> rows, Long creditId) {
        Map<Long, BigDecimal> balances = new LinkedHashMap<>();
        Map<Long, HrLeaveLedger> credits = new HashMap<>();
        Map<Long, HrLeaveLedger> indexed = new HashMap<>();
        Map<Long, BigDecimal> effective = new HashMap<>();
        for (HrLeaveLedger row : rows) indexed.put(row.getLedgerId(), row);
        for (HrLeaveLedger row : rows) {
            HrLeaveLedger original = ledgerRoot(row, indexed);
            effective.merge(original.getLedgerId(), row.getLeaveDays(), BigDecimal::add);
        }
        BigDecimal frozen = BigDecimal.ZERO;
        BigDecimal debt = BigDecimal.ZERO;
        for (HrLeaveLedger row : rows.stream().sorted(Comparator.comparing(HrLeaveLedger::getLedgerId)).toList()) {
            if (row.getReversalOfId() != null) continue;
            BigDecimal quantity = effective.get(row.getLedgerId());
            if ("FREEZE".equals(row.getTransactionType()) || "UNFREEZE".equals(row.getTransactionType())) {
                frozen = frozen.subtract(quantity);
                continue;
            }
            if (quantity.signum() > 0) {
                BigDecimal repayment = debt.min(quantity);
                debt = debt.subtract(repayment);
                balances.put(row.getLedgerId(), quantity.subtract(repayment));
                credits.put(row.getLedgerId(), row);
            } else if ("EXPIRY".equals(row.getTransactionType()) && "LEAVE_LEDGER".equals(row.getSourceBizType())) {
                Long source = Long.valueOf(row.getSourceBizId());
                balances.computeIfPresent(source, (key, balance) -> balance.add(quantity).max(BigDecimal.ZERO));
            } else if (quantity.signum() < 0) debt = debt.add(consumeCredits(balances, credits, quantity.negate()));
        }
        consumeCredits(balances, credits, frozen.max(BigDecimal.ZERO));
        return balances.getOrDefault(creditId, BigDecimal.ZERO);
    }

    private static BigDecimal consumeCredits(Map<Long, BigDecimal> balances, Map<Long, HrLeaveLedger> credits, BigDecimal quantity) {
        List<Long> ordered = balances.keySet().stream().sorted(Comparator
                .comparing((Long ledgerId) -> "CARRY_FORWARD".equals(credits.get(ledgerId).getTransactionType())
                        && credits.get(ledgerId).getToDate() != null ? credits.get(ledgerId).getToDate() : LocalDate.MAX)
                .thenComparing(Comparator.naturalOrder())).toList();
        BigDecimal remaining = quantity;
        for (Long ledgerId : ordered) {
            BigDecimal consumed = balances.get(ledgerId).min(remaining);
            balances.put(ledgerId, balances.get(ledgerId).subtract(consumed));
            remaining = remaining.subtract(consumed);
            if (remaining.signum() <= 0) return BigDecimal.ZERO;
        }
        return remaining;
    }

    private List<HrLeaveLedger> periodLedger(Long employeeId, Long leaveTypeId, Long periodId) {
        return leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getEmployeeId, employeeId)
                .eq(HrLeaveLedger::getLeaveTypeId, leaveTypeId).eq(HrLeaveLedger::getLeavePeriodId, periodId)
                .orderByAsc(HrLeaveLedger::getLedgerId));
    }

    public int reconcileQuotas() {
        int mismatches = 0;
        for (QuotaKey key : quotaKeys()) {
            mismatches += support.locked("leave:" + key.employeeId() + ":" + key.leaveTypeId(), () -> {
                HrLeaveQuota quota = findQuota(key.employeeId(), key.leaveTypeId(), key.periodId());
                HrLeaveQuota expected = calculateQuota(key.employeeId(), key.leaveTypeId(), key.periodId());
                if (quota == null || scale(quota.getTotalQuota()).compareTo(expected.getTotalQuota()) != 0
                    || scale(quota.getUsedQuota()).compareTo(expected.getUsedQuota()) != 0
                    || scale(quota.getFrozenQuota()).compareTo(expected.getFrozenQuota()) != 0
                    || scale(quota.getAvailableQuota()).compareTo(expected.getAvailableQuota()) != 0) {
                    log.warn("HR 假期额度对账不一致，不自动修正 tenantId={}, employeeId={}, leaveTypeId={}, periodId={}, expected={}, actual={}",
                            tenantId(), key.employeeId(), key.leaveTypeId(), key.periodId(),
                            expected.getAvailableQuota(), quota == null ? "MISSING" : quota.getAvailableQuota());
                    return 1;
                }
                return 0;
            });
        }
        return mismatches;
    }

    private java.util.Set<QuotaKey> quotaKeys() {
        java.util.Set<QuotaKey> keys = new java.util.LinkedHashSet<>();
        for (HrLeaveQuota row : leaveQuotaMapper.selectList(new LambdaQueryWrapper<HrLeaveQuota>()
                .eq(HrLeaveQuota::getTenantId, tenantId()).eq(HrLeaveQuota::getDeleted, 0))) {
            keys.add(new QuotaKey(row.getEmployeeId(), row.getLeaveTypeId(), row.getPeriodId()));
        }
        for (HrLeaveLedger row : leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId()))) {
            keys.add(new QuotaKey(row.getEmployeeId(), row.getLeaveTypeId(), row.getLeavePeriodId()));
        }
        return keys;
    }

    private record QuotaKey(Long employeeId, Long leaveTypeId, Long periodId) {}

    public List<Map<String, Object>> ledger(Long employeeId, Long leaveTypeId, Long periodId) {
        support.assertEmployeeScope(employeeId);
        LambdaQueryWrapper<HrLeaveLedger> wrapper = new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId())
                .eq(HrLeaveLedger::getEmployeeId, employeeId)
                .eq(HrLeaveLedger::getLeaveTypeId, leaveTypeId)
                .orderByAsc(HrLeaveLedger::getCreateTime)
                .orderByAsc(HrLeaveLedger::getLedgerId);
        if (periodId != null) wrapper.eq(HrLeaveLedger::getLeavePeriodId, periodId);
        List<HrLeaveLedger> rows = leaveLedgerMapper.selectList(wrapper);
        Map<Long, BigDecimal> balances = new HashMap<>();
        List<Map<String, Object>> result = new ArrayList<>();
        for (HrLeaveLedger row : rows) {
            BigDecimal balance = balances.merge(row.getLeavePeriodId(), scale(row.getLeaveDays()), BigDecimal::add);
            Map<String, Object> item = new HashMap<>();
            item.put("ledgerId", row.getLedgerId());
            item.put("periodId", row.getLeavePeriodId());
            item.put("remark", row.getRemark());
            item.put("reversalOfId", row.getReversalOfId());
            item.put("transactionType", row.getTransactionType());
            item.put("leaveDays", row.getLeaveDays());
            item.put("quantityUnit", row.getQuantityUnit());
            item.put("fromDate", row.getFromDate());
            item.put("toDate", row.getToDate());
            item.put("sourceBizType", row.getSourceBizType());
            item.put("sourceBizId", row.getSourceBizId());
            item.put("runningBalance", balance);
            item.put("createTime", row.getCreateTime());
            result.add(item);
        }
        return result;
    }

    public Long postLedger(com.cloudflow.hr.domain.dto.HrLeaveLedgerEntryRequest payload) {
        if (payload == null || payload.getTransactionType() == null
                || !List.of("ADJUSTMENT", "COMPENSATORY", "ENCASHMENT").contains(payload.getTransactionType())
                || payload.getQuantity() == null || payload.getQuantity().signum() == 0
                || !StringUtils.hasText(payload.getSourceId()) || !StringUtils.hasText(payload.getRemark())) {
            throw new HrBusinessException("INVALID_LEDGER_ENTRY", "请填写有效的台账类型、数量、来源编号及原因");
        }
        support.assertEmployeeScope(payload.getEmployeeId());
        return support.locked("leave:" + payload.getEmployeeId() + ":" + payload.getLeaveTypeId(), () -> {
            HrLeaveType type = getLeaveType(payload.getLeaveTypeId());
            HrLeavePeriod period = getPeriod(payload.getPeriodId());
            if (!"OPEN".equals(period.getStatus())) throw new HrBusinessException("PERIOD_CLOSED", "该假期周期已关闭");
            List<HrLeaveLedger> previous = leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                    .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getEmployeeId, payload.getEmployeeId())
                    .eq(HrLeaveLedger::getLeaveTypeId, type.getId()).eq(HrLeaveLedger::getLeavePeriodId, period.getPeriodId())
                    .eq(HrLeaveLedger::getSourceBizType, "HR_LEAVE_OPERATION").eq(HrLeaveLedger::getSourceBizId, payload.getSourceId()));
            if (!previous.isEmpty()) return previous.get(0).getLedgerId();
            BigDecimal quantity = scale(payload.getQuantity());
            if ("COMPENSATORY".equals(payload.getTransactionType()) && (!typeFlag(type.getCompensatoryFlag()) || quantity.signum() < 0)) {
                throw new HrBusinessException("COMPENSATORY_NOT_ALLOWED", "该假期不允许调休转入");
            }
            if ("ENCASHMENT".equals(payload.getTransactionType())) {
                if (!typeFlag(type.getEncashmentFlag()) || type.getEncashmentComponentId() == null || quantity.signum() < 0
                        || payload.getEncashmentAmount() == null || payload.getEncashmentAmount().signum() <= 0 || payload.getEffectiveDate() == null) {
                    throw new HrBusinessException("ENCASHMENT_NOT_ALLOWED", "折现须允许折现并提供已核定金额、生效日期及薪酬项");
                }
                quantity = quantity.negate();
                com.cloudflow.hr.domain.dto.HrCompChangePayload change = new com.cloudflow.hr.domain.dto.HrCompChangePayload();
                change.setEmployeeId(payload.getEmployeeId());
                change.setChangeNo("LE-" + java.util.UUID.randomUUID().toString().replace("-", ""));
                change.setChangeType("LEAVE_ENCASHMENT");
                change.setSalaryComponentId(encashmentComponents.requireComponent(type.getEncashmentComponentId()).getId());
                change.setBeforeTotal(BigDecimal.ZERO);
                change.setAfterTotal(scale(payload.getEncashmentAmount()));
                change.setChangeAmount(scale(payload.getEncashmentAmount()));
                change.setEffectiveDate(payload.getEffectiveDate());
                change.setStatus("APPROVED");
                change.setReason("假期折现，薪酬项ID=" + type.getEncashmentComponentId() + "，" + payload.getRemark());
                crudService.create(com.cloudflow.hr.domain.entity.HrCompChange.class, change);
            }
            if (quantity.signum() < 0) assertAvailable(payload.getEmployeeId(), type, period.getPeriodId(), quantity.abs());
            else assertAllocation(type, calculateQuota(payload.getEmployeeId(), type.getId(), period.getPeriodId()).getTotalQuota(), quantity);
            writeLedgerToPeriod(payload.getEmployeeId(), type, period.getPeriodId(), payload.getTransactionType(), quantity,
                    payload.getSourceId(), period.getStartDate(), period.getEndDate(), payload.getRemark(), "HR_LEAVE_OPERATION");
            syncQuota(payload.getEmployeeId(), type.getId(), period.getPeriodId());
            support.audit("LEAVE_QUOTA", payload.getEmployeeId(), payload.getTransactionType(), payload);
            return leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>().eq(HrLeaveLedger::getTenantId, tenantId())
                    .eq(HrLeaveLedger::getSourceBizType, "HR_LEAVE_OPERATION").eq(HrLeaveLedger::getSourceBizId, payload.getSourceId())
                    .eq(HrLeaveLedger::getEmployeeId, payload.getEmployeeId()).eq(HrLeaveLedger::getLeaveTypeId, type.getId())
                    .eq(HrLeaveLedger::getLeavePeriodId, period.getPeriodId())).get(0).getLedgerId();
        });
    }

    public Long reverseLedger(Long ledgerId, String reason) {
        HrLeaveLedger original = leaveLedgerMapper.selectById(ledgerId);
        if (original == null || !Objects.equals(original.getTenantId(), tenantId())) throw new HrBusinessException("LEDGER_NOT_FOUND", "台账记录不存在");
        if ("HR_OVERTIME".equals(original.getSourceBizType()) || original.getSourceEventKey() != null && original.getSourceEventKey().startsWith("HR_OVERTIME:")) {
            throw new HrBusinessException("OVERTIME_SOURCE_IMMUTABLE", "自动加班调休来源不能通过手工冲正改写");
        }
        if (List.of("HR_SETTLEMENT", "HR_SETTLEMENT_REVERSAL").contains(String.valueOf(original.getSourceBizType()))
                || original.getSourceEventKey() != null && (original.getSourceEventKey().startsWith("HR_SETTLEMENT:")
                || original.getSourceEventKey().startsWith("HR_SETTLEMENT_REVERSAL:"))) {
            throw new HrBusinessException("SETTLEMENT_SOURCE_IMMUTABLE", "离职结算假期及返还记录须通过原结算处理");
        }
        support.assertEmployeeScope(original.getEmployeeId());
        if (!StringUtils.hasText(reason) || List.of("FREEZE", "UNFREEZE", "ENCASHMENT", "CARRY_FORWARD").contains(original.getTransactionType())) {
            throw new HrBusinessException("REVERSAL_NOT_ALLOWED", "请填写冲正原因；冻结、折现及跨周期结转须从原业务处理");
        }
        return support.locked("leave:" + original.getEmployeeId() + ":" + original.getLeaveTypeId(), () -> {
            if (leaveLedgerMapper.selectCount(new LambdaQueryWrapper<HrLeaveLedger>().eq(HrLeaveLedger::getTenantId, tenantId())
                    .eq(HrLeaveLedger::getReversalOfId, ledgerId)) > 0) throw new HrBusinessException("ALREADY_REVERSED", "该记录已冲正");
            HrLeaveType type = getLeaveType(original.getLeaveTypeId());
            if (!"OPEN".equals(getPeriod(original.getLeavePeriodId()).getStatus())) throw new HrBusinessException("PERIOD_CLOSED", "已关闭周期不能冲正");
            BigDecimal quantity = original.getLeaveDays().negate();
            if (quantity.signum() < 0) assertAvailable(original.getEmployeeId(), type, original.getLeavePeriodId(), quantity.abs());
            HrLeaveLedger reversal = new HrLeaveLedger();
            reversal.setTenantId(tenantId());
            reversal.setEmployeeId(original.getEmployeeId());
            reversal.setLeaveTypeId(original.getLeaveTypeId());
            reversal.setLeavePeriodId(original.getLeavePeriodId());
            reversal.setTransactionType("ADJUSTMENT");
            reversal.setSourceBizType("REVERSAL");
            reversal.setSourceBizId(ledgerId.toString());
            reversal.setReversalOfId(ledgerId);
            reversal.setLeaveDays(quantity);
            reversal.setQuantityUnit(original.getQuantityUnit());
            reversal.setCarryForwardFlag(0);
            reversal.setExpiredFlag(0);
            reversal.setLwpFlag(original.getLwpFlag());
            reversal.setRemark(reason);
            reversal.setOperatorId(UserContext.getUserId());
            reversal.setCreateBy(currentUserName());
            reversal.setCreateTime(LocalDateTime.now());
            leaveLedgerMapper.insert(reversal);
            syncQuota(original.getEmployeeId(), original.getLeaveTypeId(), original.getLeavePeriodId());
            support.audit("LEAVE_LEDGER", ledgerId, "REVERSAL", Map.of("reversalId", reversal.getLedgerId(), "reason", reason));
            return reversal.getLedgerId();
        });
    }

    public void updateRequest(Long requestId, HrTimeRequestPayload payload) {
        HrTimeRequest current = loadRequest(requestId);
        support.assertEmployeeScope(current.getEmployeeId());
        if ("LEAVE".equalsIgnoreCase(current.getRequestType()) || "LEAVE".equalsIgnoreCase(payload.getRequestType())) {
            throw new HrBusinessException("LEAVE_IMMUTABLE", "已提交请假请先撤回，再重新提交");
        }
        crudService.update(HrTimeRequest.class, requestId, payload);
    }

    @Audit(name = "删除考勤申请", spel = "#requestId", highRisk = true)
    public void deleteRequest(Long requestId) {
        HrTimeRequest request = loadRequest(requestId);
        support.assertEmployeeScope(request.getEmployeeId());
        if ("LEAVE".equalsIgnoreCase(request.getRequestType())) throw new HrBusinessException("LEAVE_IMMUTABLE", "请假记录须保留，请使用撤回功能");
        crudService.delete(HrTimeRequest.class, requestId);
    }

    public void changeRequestStatus(Long requestId, String action) {
        if (action == null) throw new HrBusinessException("INVALID_ACTION", "请指定操作");
        if (List.of("cancel", "revoke").contains(action.toLowerCase(Locale.ROOT))) { revoke(requestId); return; }
        HrTimeRequest request = loadRequest(requestId);
        support.assertEmployeeScope(request.getEmployeeId());
        if (!"LEAVE".equalsIgnoreCase(request.getRequestType())) { crudService.changeStatus(HrTimeRequest.class, requestId, action); return; }
        throw new HrBusinessException("LEAVE_STATE_CHANGE_DENIED", "该请假须由审批流程变更状态");
    }

    private void freeze(Long employeeId, HrLeaveType type, Long periodId, BigDecimal quantity,
                        Long requestId, LocalDate from, LocalDate to, String remark) {
        withLock(employeeId, type.getId(), () -> {
            if (existsSource(requestId, "FREEZE")) return;
            assertAvailable(employeeId, type, periodId, quantity);
            writeLedger(employeeId, type, periodId, "FREEZE", quantity.negate(), requestId, from, to, remark);
            syncQuota(employeeId, type.getId(), periodId);
        });
    }

    private void allocateLocked(Long employeeId, HrLeaveType type, Long periodId, BigDecimal quantity,
                                Long sourceId, String sourceType, LocalDate from, LocalDate to, String remark) {
        withLock(employeeId, type.getId(), () -> {
            String source = sourceId == null ? null : String.valueOf(sourceId);
            if (source != null && leaveLedgerMapper.selectCount(new LambdaQueryWrapper<HrLeaveLedger>()
                    .eq(HrLeaveLedger::getTenantId, tenantId())
                    .eq(HrLeaveLedger::getEmployeeId, employeeId)
                    .eq(HrLeaveLedger::getLeaveTypeId, type.getId())
                    .eq(HrLeaveLedger::getLeavePeriodId, periodId)
                    .eq(HrLeaveLedger::getTransactionType, "ALLOCATION")
                    .eq(HrLeaveLedger::getSourceBizType, sourceType)
                    .eq(HrLeaveLedger::getSourceBizId, source)) > 0) return;
            assertAllocation(type, calculateQuota(employeeId, type.getId(), periodId).getTotalQuota(), quantity);
            writeLedgerToPeriod(employeeId, type, periodId, "ALLOCATION", quantity, source,
                    from, to, remark, sourceType);
            syncQuota(employeeId, type.getId(), periodId);
        });
    }

    private void commit(Long employeeId, HrLeaveType type, Long periodId, BigDecimal quantity,
                        Long requestId, LocalDate from, LocalDate to) {
        withLock(employeeId, type.getId(), () -> {
            if (existsSource(requestId, "APPLICATION")) return;
            if (!existsSource(requestId, "FREEZE")) {
                assertAvailable(employeeId, type, periodId, quantity);
            }
            writeLedger(employeeId, type, periodId, "APPLICATION", quantity.negate(), requestId, from, to, "审批通过扣减");
            if (existsSource(requestId, "FREEZE")) {
                writeLedger(employeeId, type, periodId, "UNFREEZE", quantity, requestId, from, to, "审批通过释放冻结");
            }
            syncQuota(employeeId, type.getId(), periodId);
        });
    }

    private void release(Long employeeId, HrLeaveType type, Long periodId, BigDecimal quantity,
                         Long requestId, LocalDate from, LocalDate to) {
        if (quantity == null || quantity.signum() <= 0) return;
        withLock(employeeId, type.getId(), () -> {
            if (!existsSource(requestId, "FREEZE") || existsSource(requestId, "UNFREEZE")) return;
            writeLedger(employeeId, type, periodId, "UNFREEZE", quantity, requestId, from, to, "审批驳回或撤回释放");
            syncQuota(employeeId, type.getId(), periodId);
        });
    }

    private void adjustLocked(Long employeeId, HrLeaveType type, Long periodId, BigDecimal delta,
                              Long relatedId, String remark) {
        withLock(employeeId, type.getId(), () -> {
            if (delta.signum() < 0 && !typeFlag(type.getAllowNegativeFlag())) {
                assertAvailable(employeeId, type, periodId, delta.abs());
            }
            writeLedger(employeeId, type, periodId, "ADJUSTMENT", delta, relatedId,
                    null, null, remark);
            syncQuota(employeeId, type.getId(), periodId);
        });
    }

    private void assertAvailable(Long employeeId, HrLeaveType type, Long periodId, BigDecimal quantity) {
        HrLeaveQuota quota = syncQuota(employeeId, type.getId(), periodId);
        if (!typeFlag(type.getAllowNegativeFlag())
                && scale(quota.getAvailableQuota()).compareTo(scale(quantity)) < 0) {
            checkRule("hr.leave.quota.limit", true, employeeId, quota.getAvailableQuota(), quantity, "假期可用额度不足");
            throw HrBusinessException.insufficientQuota(type.getLeaveName(), quota.getAvailableQuota(), quantity);
        }
    }

    private HrLeaveQuota syncQuota(Long employeeId, Long leaveTypeId, Long periodId) {
        HrLeaveQuota balance = calculateQuota(employeeId, leaveTypeId, periodId);
        HrLeaveQuota quota = findQuota(employeeId, leaveTypeId, periodId);
        if (quota == null) {
            quota = new HrLeaveQuota();
            quota.setTenantId(tenantId());
            quota.setEmployeeId(employeeId);
            quota.setLeaveTypeId(leaveTypeId);
            quota.setPeriodId(periodId);
            quota.setDeleted(0);
            quota.setCreateBy(currentUserName());
            quota.setCreateTime(LocalDateTime.now());
        }
        quota.setTotalQuota(balance.getTotalQuota());
        quota.setUsedQuota(balance.getUsedQuota());
        quota.setFrozenQuota(balance.getFrozenQuota());
        quota.setAvailableQuota(balance.getAvailableQuota());
        quota.setLastCalcTime(LocalDateTime.now());
        quota.setUpdateBy(currentUserName());
        quota.setUpdateTime(LocalDateTime.now());
        if (quota.getId() == null) leaveQuotaMapper.insert(quota); else leaveQuotaMapper.updateById(quota);
        return quota;
    }

    private HrLeaveQuota findQuota(Long employeeId, Long leaveTypeId, Long periodId) {
        return leaveQuotaMapper.selectOne(new LambdaQueryWrapper<HrLeaveQuota>()
                .eq(HrLeaveQuota::getTenantId, tenantId())
                .eq(HrLeaveQuota::getEmployeeId, employeeId)
                .eq(HrLeaveQuota::getLeaveTypeId, leaveTypeId)
                .eq(HrLeaveQuota::getPeriodId, periodId));
    }

    private boolean existsSource(Long requestId, String transactionType) {
        if (requestId == null) return false;
        return leaveLedgerMapper.selectCount(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId())
                .eq(HrLeaveLedger::getSourceBizType, "HR_TIME_REQUEST")
                .eq(HrLeaveLedger::getSourceBizId, String.valueOf(requestId))
                .eq(HrLeaveLedger::getTransactionType, transactionType)) > 0;
    }

    private void writeLedger(Long employeeId, HrLeaveType type, Long periodId, String transactionType,
                             BigDecimal quantity, Long sourceId, LocalDate from, LocalDate to, String remark) {
        HrLeaveLedger ledger = new HrLeaveLedger();
        ledger.setTenantId(tenantId());
        ledger.setEmployeeId(employeeId);
        ledger.setLeaveTypeId(type.getId());
        ledger.setLeavePeriodId(periodId);
        ledger.setTransactionType(transactionType);
        ledger.setSourceBizType(sourceId == null ? "MANUAL" : "HR_TIME_REQUEST");
        ledger.setSourceBizId(sourceId == null ? null : String.valueOf(sourceId));
        ledger.setLeaveDays(scale(quantity));
        ledger.setQuantityUnit(StringUtils.hasText(type.getUnit()) ? upper(type.getUnit()) : "DAY");
        ledger.setFromDate(from);
        ledger.setToDate(to);
        ledger.setCarryForwardFlag("CARRY_FORWARD".equals(transactionType) ? 1 : 0);
        ledger.setExpiredFlag("EXPIRY".equals(transactionType) ? 1 : 0);
        ledger.setLwpFlag(typeFlag(type.getLwpFlag()) ? 1 : 0);
        ledger.setOperatorId(UserContext.getUserId());
        ledger.setRemark(remark);
        ledger.setCreateBy(currentUserName());
        ledger.setCreateTime(LocalDateTime.now());
        leaveLedgerMapper.insert(ledger);
    }

    private void writeLedgerToPeriod(Long employeeId, HrLeaveType type, Long periodId, String transactionType,
                                     BigDecimal quantity, String sourceId, LocalDate from, LocalDate to,
                                     String remark) {
        writeLedgerToPeriod(employeeId, type, periodId, transactionType, quantity, sourceId, from, to, remark,
                "LEAVE_PERIOD");
    }

    private void writeLedgerToPeriod(Long employeeId, HrLeaveType type, Long periodId, String transactionType,
                                     BigDecimal quantity, String sourceId, LocalDate from, LocalDate to,
                                     String remark, String sourceType) {
        writeLedgerToPeriod(employeeId, type, periodId, transactionType, quantity, sourceId, from, to, remark, sourceType, null);
    }

    private Long writeLedgerToPeriod(Long employeeId, HrLeaveType type, Long periodId, String transactionType,
                                     BigDecimal quantity, String sourceId, LocalDate from, LocalDate to,
                                     String remark, String sourceType, String eventKey) {
        HrLeaveLedger ledger = new HrLeaveLedger();
        ledger.setTenantId(tenantId());
        ledger.setEmployeeId(employeeId);
        ledger.setLeaveTypeId(type.getId());
        ledger.setLeavePeriodId(periodId);
        ledger.setTransactionType(transactionType);
        ledger.setSourceBizType(sourceType);
        ledger.setSourceBizId(sourceId);
        ledger.setSourceEventKey(eventKey);
        ledger.setLeaveDays(scale(quantity));
        ledger.setQuantityUnit(StringUtils.hasText(type.getUnit()) ? upper(type.getUnit()) : "DAY");
        ledger.setFromDate(from);
        ledger.setToDate(to);
        ledger.setCarryForwardFlag("CARRY_FORWARD".equals(transactionType) ? 1 : 0);
        ledger.setExpiredFlag("EXPIRY".equals(transactionType) ? 1 : 0);
        ledger.setLwpFlag(typeFlag(type.getLwpFlag()) ? 1 : 0);
        ledger.setOperatorId(UserContext.getUserId());
        ledger.setRemark(remark);
        ledger.setCreateBy(currentUserName());
        ledger.setCreateTime(LocalDateTime.now());
        leaveLedgerMapper.insert(ledger);
        return ledger.getLedgerId();
    }

    /** Invoked under the existing employee/type leave lock, retained through settlement commit. */
    Long freezeSettlementLocked(Long settlementId, Integer revision, Long employeeId, Long leaveTypeId, Long periodId,
            BigDecimal quantity, String unit, LocalDate relievingDate) {
        requireSettlementTransaction(settlementId, revision);
        if (quantity == null || quantity.signum() <= 0 || quantity.scale() > 2 || quantity.compareTo(new BigDecimal("999999.99")) > 0) throw new HrBusinessException("SETTLEMENT_LEAVE_QUANTITY", "结算假期数量无效");
        HrLeaveType type = getLeaveType(leaveTypeId); HrLeavePeriod period = getPeriod(periodId);
        if (!Integer.valueOf(1).equals(type.getEncashmentFlag()) || !isQuotaRequired(type) || !Objects.equals(type.getUnit(), unit)
                || !List.of("DAY", "HOUR").contains(unit) || !"OPEN".equals(period.getStatus()) || relievingDate == null
                || relievingDate.isBefore(period.getStartDate()) || relievingDate.isAfter(period.getEndDate())) throw new HrBusinessException("SETTLEMENT_LEAVE_SOURCE_CHANGED", "假期折现来源已变化，请重新计算");
        String key = settlementLeaveKey(settlementId, revision, leaveTypeId, periodId);
        HrLeaveLedger existing = settlementLeaveEvent(key + ":FREEZE");
        if (existing != null) {
            verifySettlementLeave(existing, settlementId, employeeId, leaveTypeId, periodId, unit, quantity.negate(), "FREEZE");
            if (settlementLeaveEvent(key + ":UNFREEZE") != null) throw new HrBusinessException("SETTLEMENT_LEAVE_RELEASED", "本轮假期预约已释放，须重新提交");
            return existing.getLedgerId();
        }
        HrLeaveQuota balance = calculateQuota(employeeId, leaveTypeId, periodId);
        if (balance.getFrozenQuota().signum() != 0 || balance.getAvailableQuota().compareTo(quantity) != 0) throw new HrBusinessException("SETTLEMENT_LEAVE_SOURCE_CHANGED", "假期余额已变化或被其他业务占用");
        Long identifier = writeLedgerToPeriod(employeeId, type, periodId, "FREEZE", quantity.negate(), settlementId.toString(),
                relievingDate, relievingDate, "离职结算冻结，尚未折现入账", "HR_SETTLEMENT", key + ":FREEZE");
        syncQuota(employeeId, leaveTypeId, periodId);
        support.audit("HR_FINAL_SETTLEMENT", settlementId, "LEAVE_FREEZE", Map.of("ledgerId", identifier, "revision", revision, "quantity", quantity, "unit", unit));
        return identifier;
    }

    Long releaseSettlementLocked(Long settlementId, Integer revision, Long employeeId, Long leaveTypeId, Long periodId,
            BigDecimal quantity, String unit) {
        requireSettlementTransaction(settlementId, revision);
        String key = settlementLeaveKey(settlementId, revision, leaveTypeId, periodId);
        HrLeaveLedger original = settlementLeaveEvent(key + ":FREEZE");
        verifySettlementLeave(original, settlementId, employeeId, leaveTypeId, periodId, unit, quantity.negate(), "FREEZE");
        HrLeaveLedger existing = settlementLeaveEvent(key + ":UNFREEZE");
        if (existing != null) { verifySettlementLeave(existing, settlementId, employeeId, leaveTypeId, periodId, unit, quantity, "UNFREEZE"); return existing.getLedgerId(); }
        if (calculateQuota(employeeId, leaveTypeId, periodId).getFrozenQuota().compareTo(quantity) < 0) throw new HrBusinessException("SETTLEMENT_LEAVE_SOURCE_CHANGED", "假期冻结余额与原预约不一致");
        HrLeaveLedger release = new HrLeaveLedger();
        release.setTenantId(tenantId()); release.setEmployeeId(employeeId); release.setLeaveTypeId(leaveTypeId); release.setLeavePeriodId(periodId);
        release.setTransactionType("UNFREEZE"); release.setSourceBizType("HR_SETTLEMENT"); release.setSourceBizId(settlementId.toString()); release.setSourceEventKey(key + ":UNFREEZE");
        release.setLeaveDays(original.getLeaveDays().negate()); release.setQuantityUnit(original.getQuantityUnit());
        release.setFromDate(original.getFromDate()); release.setToDate(original.getToDate()); release.setCarryForwardFlag(0); release.setExpiredFlag(0); release.setLwpFlag(original.getLwpFlag());
        release.setOperatorId(UserContext.getUserId()); release.setRemark("离职结算释放原冻结，原数量及单位保留"); release.setCreateBy(currentUserName()); release.setCreateTime(LocalDateTime.now());
        if (leaveLedgerMapper.insert(release) != 1) throw new HrBusinessException("SETTLEMENT_LEAVE_RELEASE_FAILED", "假期释放未保存");
        syncQuota(employeeId, leaveTypeId, periodId);
        support.audit("HR_FINAL_SETTLEMENT", settlementId, "LEAVE_UNFREEZE", Map.of("ledgerId", release.getLedgerId(), "freezeLedgerId", original.getLedgerId(), "revision", revision));
        return release.getLedgerId();
    }

    Long postSettlementLocked(Long settlementId, Integer revision, Long employeeId, Long leaveTypeId, Long periodId,
            BigDecimal quantity, String unit) {
        requireSettlementTransaction(settlementId, revision);
        String key = settlementLeaveKey(settlementId, revision, leaveTypeId, periodId);
        HrLeaveLedger original = settlementLeaveEvent(key + ":FREEZE");
        verifySettlementLeave(original, settlementId, employeeId, leaveTypeId, periodId, unit, quantity.negate(), "FREEZE");
        HrLeaveLedger existing = settlementLeaveEvent(key + ":ENCASHMENT");
        if (existing != null) {
            verifySettlementLeave(existing, settlementId, employeeId, leaveTypeId, periodId, unit, quantity.negate(), "ENCASHMENT");
            return existing.getLedgerId();
        }
        if (settlementLeaveEvent(key + ":UNFREEZE") != null) throw new HrBusinessException("SETTLEMENT_LEAVE_RELEASED", "原结算假期预约已释放，不能入账");
        HrLeaveType type = getLeaveType(leaveTypeId);
        if (!Objects.equals(type.getUnit(), unit)) throw new HrBusinessException("SETTLEMENT_LEAVE_SOURCE_CHANGED", "假期单位与原冻结不一致");
        releaseSettlementLocked(settlementId, revision, employeeId, leaveTypeId, periodId, quantity, unit);
        HrLeaveLedger entry = new HrLeaveLedger();
        entry.setTenantId(tenantId()); entry.setEmployeeId(employeeId); entry.setLeaveTypeId(leaveTypeId); entry.setLeavePeriodId(periodId);
        entry.setTransactionType("ENCASHMENT"); entry.setSourceBizType("HR_SETTLEMENT"); entry.setSourceBizId(settlementId.toString()); entry.setSourceEventKey(key + ":ENCASHMENT");
        entry.setLeaveDays(original.getLeaveDays()); entry.setQuantityUnit(original.getQuantityUnit()); entry.setFromDate(original.getFromDate()); entry.setToDate(original.getToDate());
        entry.setCarryForwardFlag(0); entry.setExpiredFlag(0); entry.setLwpFlag(original.getLwpFlag()); entry.setOperatorId(UserContext.getUserId());
        entry.setRemark("离职结算实际收付或净额抵销后折现，沿用原数量及单位"); entry.setCreateBy(currentUserName()); entry.setCreateTime(HrHSupport.now());
        if (leaveLedgerMapper.insert(entry) != 1) throw new HrBusinessException("SETTLEMENT_LEAVE_POST_FAILED", "假期结算入账未保存");
        syncQuota(employeeId, leaveTypeId, periodId);
        support.audit("HR_FINAL_SETTLEMENT", settlementId, "LEAVE_ENCASHMENT", Map.of("ledgerId", entry.getLedgerId(), "freezeLedgerId", original.getLedgerId(), "revision", revision));
        return entry.getLedgerId();
    }

    private HrLeaveLedger settlementLeaveEvent(String key) {
        return leaveLedgerMapper.selectOne(new LambdaQueryWrapper<HrLeaveLedger>().eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getSourceEventKey, key));
    }

    /** The enclosing settlement transaction verifies original and reverse money before restoring recorded quantities. */
    Long reverseSettlementLocked(Long originalSettlementId, Integer originalRevision, Long reversalId, Long employeeId,
            Long leaveTypeId, Long periodId, BigDecimal quantity, String unit) {
        return reverseSettlementLocked(originalSettlementId, originalRevision, reversalId, employeeId, leaveTypeId, periodId, quantity, unit, true);
    }

    Long reverseSettlementLocked(Long originalSettlementId, Integer originalRevision, Long reversalId, Long employeeId,
            Long leaveTypeId, Long periodId, BigDecimal quantity, String unit, boolean apply) {
        requireSettlementTransaction(originalSettlementId, originalRevision); requireSettlementTransaction(reversalId, originalRevision);
        if (originalSettlementId.equals(reversalId) || quantity == null || quantity.signum() <= 0
                || quantity.stripTrailingZeros().scale() > 2 || !List.of("DAY", "HOUR").contains(String.valueOf(unit))) throw settlementLeaveReversalChanged();
        String originalKey = settlementLeaveKey(originalSettlementId, originalRevision, leaveTypeId, periodId);
        HrLeaveLedger original = settlementLeaveEvent(originalKey + ":ENCASHMENT");
        verifySettlementLeave(original, originalSettlementId, employeeId, leaveTypeId, periodId, unit, quantity.negate(), "ENCASHMENT");
        verifySettlementLeave(settlementLeaveEvent(originalKey + ":FREEZE"), originalSettlementId, employeeId, leaveTypeId, periodId, unit, quantity.negate(), "FREEZE");
        verifySettlementLeave(settlementLeaveEvent(originalKey + ":UNFREEZE"), originalSettlementId, employeeId, leaveTypeId, periodId, unit, quantity, "UNFREEZE");
        if (!Objects.equals(getLeaveType(leaveTypeId).getUnit(), unit)) throw settlementLeaveReversalChanged();
        getPeriod(periodId);
        String key = "HR_SETTLEMENT_REVERSAL:" + reversalId + ":LEAVE:" + original.getLedgerId();
        List<HrLeaveLedger> previous = leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getReversalOfId, original.getLedgerId()));
        if (!previous.isEmpty()) {
            if (previous.size() != 1) throw settlementLeaveReversalChanged();
            HrLeaveLedger refund = previous.get(0);
            if (!"HR_SETTLEMENT_REVERSAL".equals(refund.getSourceBizType()) || !reversalId.toString().equals(refund.getSourceBizId())
                    || !key.equals(refund.getSourceEventKey()) || !"ADJUSTMENT".equals(refund.getTransactionType())
                    || !Objects.equals(employeeId, refund.getEmployeeId()) || !Objects.equals(leaveTypeId, refund.getLeaveTypeId())
                    || !Objects.equals(periodId, refund.getLeavePeriodId()) || !unit.equals(refund.getQuantityUnit())
                    || refund.getLeaveDays() == null || refund.getLeaveDays().compareTo(quantity) != 0
                    || !Objects.equals(original.getFromDate(), refund.getFromDate()) || !Objects.equals(original.getToDate(), refund.getToDate())
                    || !Integer.valueOf(0).equals(refund.getCarryForwardFlag()) || !Integer.valueOf(0).equals(refund.getExpiredFlag())
                    || !Objects.equals(original.getLwpFlag(), refund.getLwpFlag())) throw settlementLeaveReversalChanged();
            return refund.getLedgerId();
        }
        HrLeaveQuota balance = calculateQuota(employeeId, leaveTypeId, periodId);
        if (balance.getUsedQuota().compareTo(quantity) < 0) throw settlementLeaveReversalChanged();
        if (!apply) return original.getLedgerId();
        HrLeaveLedger refund = new HrLeaveLedger();
        refund.setTenantId(tenantId()); refund.setEmployeeId(employeeId); refund.setLeaveTypeId(leaveTypeId); refund.setLeavePeriodId(periodId);
        refund.setTransactionType("ADJUSTMENT"); refund.setSourceBizType("HR_SETTLEMENT_REVERSAL"); refund.setSourceBizId(reversalId.toString());
        refund.setSourceEventKey(key); refund.setReversalOfId(original.getLedgerId()); refund.setLeaveDays(quantity); refund.setQuantityUnit(unit);
        refund.setFromDate(original.getFromDate()); refund.setToDate(original.getToDate()); refund.setCarryForwardFlag(0); refund.setExpiredFlag(0);
        refund.setLwpFlag(original.getLwpFlag()); refund.setOperatorId(UserContext.getUserId()); refund.setCreateBy(currentUserName()); refund.setCreateTime(HrHSupport.now());
        refund.setRemark("结算反向资金确认后返还原折现假期，保留原周期、数量及单位");
        if (leaveLedgerMapper.insert(refund) != 1) throw settlementLeaveReversalChanged();
        syncQuota(employeeId, leaveTypeId, periodId);
        support.audit("HR_FINAL_SETTLEMENT", reversalId, "LEAVE_RETURNED", Map.of("originalSettlementId", originalSettlementId,
                "originalLedgerId", original.getLedgerId(), "ledgerId", refund.getLedgerId(), "quantity", quantity, "unit", unit));
        return refund.getLedgerId();
    }

    private static HrBusinessException settlementLeaveReversalChanged() {
        return new HrBusinessException("SETTLEMENT_LEAVE_REVERSAL_CONFLICT", "结算假期原折现、返还数量或关联记录不一致");
    }

    private static String settlementLeaveKey(Long settlementId, Integer revision, Long leaveTypeId, Long periodId) {
        return "HR_SETTLEMENT:" + settlementId + ":LEAVE:" + leaveTypeId + ":" + periodId + ":R" + revision;
    }

    private static void requireSettlementTransaction(Long settlementId, Integer revision) {
        if (settlementId == null || settlementId <= 0 || revision == null || revision < 0
                || !org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw new HrBusinessException("TRANSACTION_REQUIRED", "结算假期须在原结算事务内处理");
    }

    private static void verifySettlementLeave(HrLeaveLedger entry, Long settlementId, Long employeeId, Long typeId, Long periodId, String unit, BigDecimal quantity, String operation) {
        if (entry == null || !"HR_SETTLEMENT".equals(entry.getSourceBizType()) || !settlementId.toString().equals(entry.getSourceBizId())
                || !Objects.equals(entry.getEmployeeId(), employeeId) || !Objects.equals(entry.getLeaveTypeId(), typeId) || !Objects.equals(entry.getLeavePeriodId(), periodId)
                || !Objects.equals(entry.getQuantityUnit(), unit) || !operation.equals(entry.getTransactionType()) || entry.getReversalOfId() != null
                || quantity == null || quantity.signum() == 0 || entry.getLeaveDays() == null || entry.getLeaveDays().compareTo(quantity) != 0) throw new HrBusinessException("SETTLEMENT_LEAVE_SOURCE_CHANGED", "结算假期事件与原冻结依据不一致");
    }

    public Long postOvertimeLocked(Long requestId, Long employeeId, Long leaveTypeId, Long periodId, BigDecimal quantity) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw new HrBusinessException("TRANSACTION_REQUIRED", "加班调休须在原结算事务内入账");
        HrLeaveType type = getLeaveType(leaveTypeId); HrLeavePeriod period = getPeriod(periodId);
        HrOvertimeRequest source = hMapper.overtimeLocked(tenantId(), requestId);
        if (source == null || flag(source.getDeleted()) || !"APPROVED".equals(source.getStatus()) || !"COMPENSATORY".equals(source.getSettleMode())
                || !Objects.equals(source.getEmployeeId(), employeeId) || !Objects.equals(source.getLeaveTypeId(), leaveTypeId)
                || source.getApprovedMinutes() == null || source.getApprovedMinutes() <= 0 || source.getPayrollCorrectionId() != null || source.getCompChangeId() != null
                || !List.of("PENDING", "NEEDS_RESOLUTION").contains(source.getSettlementStatus())) throw new HrBusinessException("OVERTIME_SOURCE_CONFLICT", "调休入账须对应真实已批准且尚未结算的原加班申请");
        if (!"OPEN".equals(period.getStatus())) throw new HrBusinessException("PERIOD_CLOSED", "目标假期周期已关闭");
        if (!typeFlag(type.getCompensatoryFlag()) || !isQuotaRequired(type) || !"HOUR".equals(type.getUnit())
                || quantity == null || quantity.signum() <= 0 || quantity.scale() > 2) throw new HrBusinessException("COMPENSATORY_NOT_ALLOWED", "须使用已核定的小时制调休假种及正差额");
        String eventKey = "HR_OVERTIME:" + requestId + ":COMPENSATORY";
        HrLeaveLedger previous = hMapper.ledgerSource(tenantId(), eventKey);
        if (previous != null) {
            if (!Objects.equals(previous.getEmployeeId(), employeeId) || !Objects.equals(previous.getLeaveTypeId(), leaveTypeId)
                    || !Objects.equals(previous.getLeavePeriodId(), periodId) || quantity.compareTo(previous.getLeaveDays()) != 0
                    || !"COMPENSATORY".equals(previous.getTransactionType()) || !"HOUR".equals(previous.getQuantityUnit()) || !"HR_OVERTIME".equals(previous.getSourceBizType())) throw new HrBusinessException("OVERTIME_SOURCE_CONFLICT", "已存在的加班调休来源依据不一致");
            return previous.getLedgerId();
        }
        assertAllocation(type, calculateQuota(employeeId, leaveTypeId, periodId).getTotalQuota(), quantity);
        Long ledgerId = writeLedgerToPeriod(employeeId, type, periodId, "COMPENSATORY", quantity, requestId.toString(), period.getStartDate(), period.getEndDate(),
                "已批准加班调休", "HR_OVERTIME", eventKey);
        syncQuota(employeeId, leaveTypeId, periodId);
        support.audit("HR_OVERTIME", requestId, "LEAVE_CREDIT", Map.of("requestId", requestId, "ledgerId", ledgerId, "periodId", periodId)); return ledgerId;
    }

    private BigDecimal prorate(BigDecimal annualDays, Long employeeId, HrLeavePeriod period, String basis) {
        BigDecimal amount = scale(annualDays);
        if (!"JOINING_DATE".equalsIgnoreCase(basis)) return amount;
        HrEmployee employee = getEmployee(employeeId);
        if (employee.getHireDate() == null || !employee.getHireDate().isAfter(period.getStartDate())) return amount;
        if (employee.getHireDate().isAfter(period.getEndDate())) return BigDecimal.ZERO.setScale(2);
        long eligibleDays = ChronoUnit.DAYS.between(employee.getHireDate(), period.getEndDate()) + 1;
        long periodDays = ChronoUnit.DAYS.between(period.getStartDate(), period.getEndDate()) + 1;
        return amount.multiply(BigDecimal.valueOf(eligibleDays))
                .divide(BigDecimal.valueOf(periodDays), 2, RoundingMode.HALF_UP);
    }

    private BigDecimal earnedPerRun(HrLeaveType type, HrLeavePeriod period) {
        BigDecimal annual = scale(type.getMaxDaysPerYear());
        String frequency = upper(type.getEarnedLeaveFrequency());
        int runs = switch (frequency) {
            case "QUARTERLY" -> 4;
            case "HALF_YEARLY" -> 2;
            case "YEARLY" -> 1;
            default -> 12;
        };
        return annual.divide(BigDecimal.valueOf(runs), 2, RoundingMode.HALF_UP);
    }

    private HrLeaveQuota calculateQuota(Long employeeId, Long leaveTypeId, Long periodId) {
        return balanceFromLedger(periodLedger(employeeId, leaveTypeId, periodId));
    }

    static HrLeaveQuota balanceFromLedger(List<HrLeaveLedger> rows) {
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal used = BigDecimal.ZERO;
        BigDecimal frozen = BigDecimal.ZERO;
        Map<Long, HrLeaveLedger> indexed = new HashMap<>();
        for (HrLeaveLedger row : rows) indexed.put(row.getLedgerId(), row);
        for (HrLeaveLedger row : rows) {
            BigDecimal value = HrRuleSupport.amount(row.getLeaveDays());
            String kind = String.valueOf(ledgerRoot(row, indexed).getTransactionType());
            if (List.of("ALLOCATION", "CARRY_FORWARD", "COMPENSATORY", "ADJUSTMENT").contains(kind)) total = total.add(value);
            else if (List.of("APPLICATION", "EXPIRY", "ENCASHMENT").contains(kind)) used = used.subtract(value);
            else if (List.of("FREEZE", "UNFREEZE").contains(kind)) frozen = frozen.subtract(value);
            else throw new HrBusinessException("INVALID_LEDGER", "未知假期台账类型");
        }
        HrLeaveQuota result = new HrLeaveQuota();
        result.setTotalQuota(HrRuleSupport.amount(total));
        result.setUsedQuota(HrRuleSupport.amount(used));
        result.setFrozenQuota(HrRuleSupport.amount(frozen));
        result.setAvailableQuota(HrRuleSupport.amount(total.subtract(used).subtract(frozen)));
        return result;
    }

    private static HrLeaveLedger ledgerRoot(HrLeaveLedger row, Map<Long, HrLeaveLedger> indexed) {
        HrLeaveLedger original = row;
        java.util.Set<Long> visited = new java.util.HashSet<>();
        while (original.getReversalOfId() != null) {
            if (!visited.add(original.getLedgerId()) || !indexed.containsKey(original.getReversalOfId())) {
                throw new HrBusinessException("INVALID_LEDGER", "冲正台账存在循环引用或缺少原记录");
            }
            original = indexed.get(original.getReversalOfId());
        }
        return original;
    }

    private BigDecimal calculateAndValidate(HrEmployee employee, HrLeaveType type, LocalDateTime start,
                                            LocalDateTime end, String reason) {
        if (start == null || end == null || !end.isAfter(start)) {
            throw new HrBusinessException("INVALID_LEAVE_TIME", "请假开始时间和结束时间无效");
        }
        if (employee.getHireDate() != null && type.getApplicableAfterDays() != null
                && start.toLocalDate().isBefore(employee.getHireDate().plusDays(type.getApplicableAfterDays()))) {
            checkRule("hr.leave.probation.limit", true, employee.getId(),
                    BigDecimal.valueOf(type.getApplicableAfterDays()),
                    BigDecimal.valueOf(ChronoUnit.DAYS.between(employee.getHireDate(), start.toLocalDate())),
                    "员工尚未达到该假期的可用入职时长");
        }
        BigDecimal result = BigDecimal.ZERO;
        for (LocalDate date = start.toLocalDate().minusDays(1); date.atStartOfDay().isBefore(end); date = date.plusDays(1)) {
            result = result.add(singleDayQuantity(employee.getId(), type, date, start, end));
        }
        result = round(result, type.getRoundingMode());
        if (result.signum() <= 0) throw new HrBusinessException("INVALID_LEAVE_DURATION", "请假时长必须大于零");
        if (type.getMaxContinuousDays() != null && result.compareTo(type.getMaxContinuousDays()) > 0) {
            checkRule("hr.leave.continuous.limit", true, employee.getId(), type.getMaxContinuousDays(), result,
                    "超过单次连续请假上限");
        }
        return result;
    }

    private BigDecimal singleDayQuantity(Long employeeId, HrLeaveType type, LocalDate date,
                                        LocalDateTime start, LocalDateTime end) {
        return dayCalculator.quantity(employeeId, type, date, start, end);
    }

    private Map<Long, BigDecimal> periodQuantities(Long employeeId, HrLeaveType type, LocalDateTime start,
                                                  LocalDateTime end, BigDecimal total) {
        Map<Long, BigDecimal> result = new LinkedHashMap<>();
        for (LocalDate date = start.toLocalDate().minusDays(1); date.atStartOfDay().isBefore(end); date = date.plusDays(1)) {
            BigDecimal quantity = singleDayQuantity(employeeId, type, date, start, end);
            if (quantity.signum() > 0) result.merge(findPeriod(date).getPeriodId(), quantity, BigDecimal::add);
        }
        BigDecimal assigned = BigDecimal.ZERO;
        BigDecimal cumulative = BigDecimal.ZERO;
        List<Long> periods = new ArrayList<>(result.keySet());
        for (int index = 0; index < periods.size(); index++) {
            Long periodId = periods.get(index);
            cumulative = cumulative.add(result.get(periodId));
            BigDecimal quantity = (index == periods.size() - 1 ? total : scale(cumulative).min(total)).subtract(assigned);
            result.put(periodId, quantity);
            assigned = assigned.add(quantity);
        }
        return result;
    }

    private void assertSubmissionRules(HrEmployee employee, HrLeaveType type, HrLeavePeriod period,
                                       BigDecimal quantity, HrTimeRequestPayload payload) {
        if (!"OPEN".equals(period.getStatus())) throw new HrBusinessException("PERIOD_CLOSED", "请假周期已关闭");
        LocalDate requestFrom = payload.getStartTime().toLocalDate().isAfter(period.getStartDate())
                ? payload.getStartTime().toLocalDate() : period.getStartDate();
        LocalDate requestTo = payload.getEndTime().minusNanos(1).toLocalDate().isBefore(period.getEndDate())
                ? payload.getEndTime().minusNanos(1).toLocalDate() : period.getEndDate();
        List<HrLeavePolicyAssignment> assignments = policyAssignmentMapper.selectList(
                new LambdaQueryWrapper<HrLeavePolicyAssignment>().eq(HrLeavePolicyAssignment::getTenantId, tenantId())
                        .eq(HrLeavePolicyAssignment::getEmployeeId, employee.getId())
                        .eq(HrLeavePolicyAssignment::getLeavePeriodId, period.getPeriodId())
                        .eq(HrLeavePolicyAssignment::getDeleted, 0).eq(HrLeavePolicyAssignment::getStatus, "ACTIVE")
                        .le(HrLeavePolicyAssignment::getEffectiveFrom, requestFrom)
                        .and(query -> query.isNull(HrLeavePolicyAssignment::getEffectiveTo)
                                .or().ge(HrLeavePolicyAssignment::getEffectiveTo, requestTo)));
        boolean assigned = assignments.stream().anyMatch(assignment -> policyDetailMapper.selectCount(
                new LambdaQueryWrapper<HrLeavePolicyDetail>().eq(HrLeavePolicyDetail::getTenantId, tenantId())
                        .eq(HrLeavePolicyDetail::getPolicyId, assignment.getPolicyId())
                        .eq(HrLeavePolicyDetail::getLeaveTypeId, type.getId()).eq(HrLeavePolicyDetail::getDeleted, 0)) > 0);
        checkRule("hr.leave.policy.required", !assigned, employee.getId(), BigDecimal.ONE,
                assigned ? BigDecimal.ONE : BigDecimal.ZERO, "员工尚未分配覆盖本次请假的有效假期政策");
        if (type.getMaxDaysPerYear() != null) {
            List<HrTimeRequest> requests = timeRequestMapper.selectList(new LambdaQueryWrapper<HrTimeRequest>()
                    .eq(HrTimeRequest::getTenantId, tenantId()).eq(HrTimeRequest::getEmployeeId, employee.getId())
                    .eq(HrTimeRequest::getLeaveTypeId, type.getId()).eq(HrTimeRequest::getDeleted, 0)
                    .in(HrTimeRequest::getStatus, "PENDING", "SUBMITTED", "APPROVING", "APPLYING", "APPROVED")
                    .lt(HrTimeRequest::getStartTime, period.getEndDate().plusDays(2).atStartOfDay())
                    .gt(HrTimeRequest::getEndTime, period.getStartDate().atStartOfDay()));
            BigDecimal annual = quantity;
            for (HrTimeRequest request : requests) {
                Object snapshot = support.auditDetail("TIME_REQUEST", request.getId(), "LEAVE_SUBMIT").get("periodQuantities");
                if (snapshot instanceof Map<?, ?> quantities) {
                    Object saved = quantities.containsKey(period.getPeriodId()) ? quantities.get(period.getPeriodId()) : quantities.get(String.valueOf(period.getPeriodId()));
                    if (saved != null) annual = annual.add(new BigDecimal(saved.toString()));
                    continue;
                }
                LocalDate from = request.getStartTime().toLocalDate().minusDays(1).isAfter(period.getStartDate())
                        ? request.getStartTime().toLocalDate().minusDays(1) : period.getStartDate();
                for (LocalDate date = from; !date.isAfter(period.getEndDate()) && date.atStartOfDay().isBefore(request.getEndTime()); date = date.plusDays(1)) {
                    annual = annual.add(singleDayQuantity(employee.getId(), type, date, request.getStartTime(), request.getEndTime()));
                }
            }
            checkRule("hr.leave.annual.limit", annual.compareTo(type.getMaxDaysPerYear()) > 0,
                    employee.getId(), type.getMaxDaysPerYear(), annual, "超过假期周期累计上限");
        }
    }

    private void checkRule(String code, boolean violated, Long employeeId, BigDecimal threshold,
                           BigDecimal actual, String message) {
        if (!violated) return;
        R<BusinessRuleDTO> response = businessRuleClient.getEffectiveRule(code);
        if (response == null || !response.isSuccess()) {
            throw new HrBusinessException("RULE_SERVICE_UNAVAILABLE", "假期规则校验服务不可用");
        }
        BusinessRuleDTO rule = response.getData();
        String effect = rule == null || Integer.valueOf(0).equals(rule.getEnabled()) ? "BLOCK" : upper(rule.getEffect());
        if (!List.of("BLOCK", "WARN", "PASS").contains(effect)) effect = "BLOCK";
        BusinessRuleHitRecordDTO hit = new BusinessRuleHitRecordDTO();
        hit.setTenantId(tenantId());
        hit.setRuleCode(code);
        hit.setBusinessType("HR_LEAVE");
        hit.setBusinessId(employeeId);
        hit.setThresholdValue(threshold);
        hit.setActualValue(actual);
        hit.setEffect(effect);
        hit.setHitResult(effect);
        R<Void> recorded = businessRuleClient.recordHit(hit);
        if (recorded == null || !recorded.isSuccess()) throw new HrBusinessException("RULE_AUDIT_FAILED", "假期规则命中记录保存失败");
        if ("BLOCK".equals(effect)) throw new HrBusinessException("LEAVE_RULE_BLOCKED", message);
        if ("WARN".equals(effect)) log.warn("假期规则警告 ruleCode={}, employeeId={}, message={}", code, employeeId, message);
    }

    private List<HrLeaveLedger> requestFreezes(Long requestId) {
        return leaveLedgerMapper.selectList(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getSourceBizType, "HR_TIME_REQUEST")
                .eq(HrLeaveLedger::getSourceBizId, String.valueOf(requestId)).eq(HrLeaveLedger::getTransactionType, "FREEZE")
                .orderByAsc(HrLeaveLedger::getLeavePeriodId));
    }

    private boolean sourceExists(Long requestId, String transactionType, Long periodId) {
        return leaveLedgerMapper.selectCount(new LambdaQueryWrapper<HrLeaveLedger>()
                .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getSourceBizType, "HR_TIME_REQUEST")
                .eq(HrLeaveLedger::getSourceBizId, String.valueOf(requestId))
                .eq(HrLeaveLedger::getLeavePeriodId, periodId).eq(HrLeaveLedger::getTransactionType, transactionType)) > 0;
    }

    private void assertAllocation(HrLeaveType type, BigDecimal existing, BigDecimal delta) {
        BigDecimal target = existing.add(delta);
        if (target.signum() < 0 || (!typeFlag(type.getAllowOverAllocationFlag()) && type.getMaxDaysPerYear() != null
                && target.compareTo(type.getMaxDaysPerYear()) > 0)) {
            throw new HrBusinessException("LEAVE_ALLOCATION_LIMIT", "分配额度超出假期类型允许的范围");
        }
    }

    private HrLeavePeriod findPeriod(LocalDate date) {
        List<HrLeavePeriod> periods = leavePeriodMapper.selectList(new LambdaQueryWrapper<HrLeavePeriod>()
                .eq(HrLeavePeriod::getTenantId, tenantId())
                .eq(HrLeavePeriod::getDeleted, 0)
                .eq(HrLeavePeriod::getStatus, "OPEN")
                .le(HrLeavePeriod::getStartDate, date)
                .ge(HrLeavePeriod::getEndDate, date)
                .orderByDesc(HrLeavePeriod::getDefaultFlag));
        if (periods.size() != 1) throw new HrBusinessException("LEAVE_PERIOD_NOT_FOUND", "请假日期必须匹配唯一的开放假期周期");
        return periods.get(0);
    }

    private HrLeavePeriod getPeriod(Long id) {
        HrLeavePeriod period = org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                ? leavePeriodMapper.selectLocked(id, tenantId()) : leavePeriodMapper.selectById(id);
        if (period == null || !Objects.equals(period.getTenantId(), tenantId())
                || Objects.equals(period.getDeleted(), 1)) {
            throw new HrBusinessException("LEAVE_PERIOD_NOT_FOUND", "假期周期不存在");
        }
        return period;
    }

    private HrLeaveType getLeaveType(Long id) {
        return getLeaveType(id, true);
    }

    private HrLeaveType getLeaveType(Long id, boolean requireActive) {
        HrLeaveType type = leaveTypeMapper.selectById(id);
        if (type == null || !Objects.equals(type.getTenantId(), tenantId())
                || requireActive && !Objects.equals(type.getStatus(), 1)) {
            throw new HrBusinessException("LEAVE_TYPE_NOT_FOUND", "假期类型不存在或已停用");
        }
        return type;
    }

    private HrEmployee getEmployee(Long id) {
        HrEmployee employee = employeeMapper.selectById(id);
        if (employee == null || !Objects.equals(employee.getTenantId(), tenantId())
                || Objects.equals(employee.getDeleted(), 1)) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }
        return employee;
    }

    private HrTimeRequest loadRequest(Long id) {
        HrTimeRequest request = timeRequestMapper.selectById(id);
        if (request == null || !Objects.equals(request.getTenantId(), tenantId())
                || Objects.equals(request.getDeleted(), 1)) {
            throw new HrBusinessException("LEAVE_REQUEST_NOT_FOUND", "请假申请不存在");
        }
        if ("OVERTIME".equalsIgnoreCase(request.getRequestType())) throw new HrBusinessException("OVERTIME_LEGACY_DISABLED", "加班须使用独立申请入口");
        return request;
    }

    private void validateRequestPayload(HrTimeRequestPayload payload) {
        if (payload == null || payload.getEmployeeId() == null || payload.getLeaveTypeId() == null
                || payload.getStartTime() == null || payload.getEndTime() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "员工、假期类型和请假时间不能为空");
        }
        if (StringUtils.hasText(payload.getRequestType())
                && !"LEAVE".equalsIgnoreCase(payload.getRequestType())) {
            throw new HrBusinessException("INVALID_LEAVE_TYPE", "该接口仅支持 LEAVE 请假申请");
        }
    }

    private boolean isQuotaRequired(HrLeaveType type) {
        return typeFlag(type.getNeedQuota());
    }

    private BigDecimal round(BigDecimal value, String mode) {
        if (value == null) return BigDecimal.ZERO.setScale(2);
        if ("HALF_DAY".equalsIgnoreCase(mode)) {
            return value.divide(HALF, 0, RoundingMode.CEILING).multiply(HALF).setScale(2);
        }
        if ("FULL_DAY".equalsIgnoreCase(mode)) return value.setScale(0, RoundingMode.CEILING).setScale(2);
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private boolean typeFlag(Integer value) {
        return value != null && value == 1;
    }

    private String upper(String value) {
        return value == null ? "" : value.toUpperCase(Locale.ROOT);
    }

    private BigDecimal scale(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private void withLock(Long employeeId, Long leaveTypeId, Runnable action) {
        support.locked("leave:" + employeeId + ":" + leaveTypeId, () -> { action.run(); return null; });
    }

    private Long tenantId() {
        return HrRuleSupport.tenantId();
    }

    private String currentUserName() {
        return HrRuleSupport.userName();
    }
}

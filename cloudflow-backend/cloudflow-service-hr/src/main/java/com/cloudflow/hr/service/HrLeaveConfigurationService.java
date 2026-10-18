package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.hr.domain.dto.HrLeavePolicyAssignRequest;
import com.cloudflow.hr.domain.dto.HrLeaveTypePayload;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrLeaveConfigurationService {
    private final HrLeaveEncashmentComponentService encashmentComponents;
    private final HrRuleSupport support;
    private final HrTypedCrudService crudService;
    private final HrLeaveBusinessService leaveService;
    private final HrLeavePeriodMapper periodMapper;
    private final HrHMapper hMapper;
    private final HrLeavePolicyMapper policyMapper;
    private final HrLeavePolicyDetailMapper detailMapper;
    private final HrLeavePolicyAssignmentMapper assignmentMapper;
    private final HrLeaveLedgerMapper ledgerMapper;
    private final HrLeaveTypeMapper typeMapper;
    private final HrTimeRequestMapper requestMapper;

    public List<Map<String, Object>> list(String resource, Map<String, Object> query) {
        Class<?> entity = switch (resource) {
            case "periods" -> HrLeavePeriod.class;
            case "policies" -> HrLeavePolicy.class;
            case "policy-details" -> HrLeavePolicyDetail.class;
            case "policy-assignments" -> HrLeavePolicyAssignment.class;
            case "earned-schedules" -> HrEarnedLeaveSchedule.class;
            default -> throw new HrBusinessException("INVALID_RESOURCE", "未知假期资源");
        };
        return crudService.list(entity, query);
    }

    public Long savePeriod(Long periodId, HrLeavePeriod payload) {
        if (payload == null || !StringUtils.hasText(payload.getPeriodName()) || payload.getStartDate() == null
                || payload.getEndDate() == null || payload.getEndDate().isBefore(payload.getStartDate())) {
            throw new HrBusinessException("INVALID_PERIOD", "请填写有效的周期名称和日期范围");
        }
        return support.locked("leave-configuration", () -> {
            if (payload.getStatus() == null) payload.setStatus("OPEN");
            if (!List.of("OPEN", "CLOSED").contains(payload.getStatus())) throw new HrBusinessException("INVALID_STATUS", "假期周期状态无效");
            if (periodMapper.selectCount(new LambdaQueryWrapper<HrLeavePeriod>().eq(HrLeavePeriod::getTenantId, tenantId())
                    .eq(HrLeavePeriod::getDeleted, 0).ne(periodId != null, HrLeavePeriod::getPeriodId, periodId)
                    .le(HrLeavePeriod::getStartDate, payload.getEndDate()).ge(HrLeavePeriod::getEndDate, payload.getStartDate())) > 0) {
                throw new HrBusinessException("PERIOD_OVERLAP", "假期周期日期不可重叠");
            }
            if (periodId != null) {
                HrLeavePeriod current = periodMapper.selectLocked(periodId, tenantId());
                if (current == null || !Objects.equals(tenantId(), current.getTenantId()) || flag(current.getDeleted())) {
                    throw new HrBusinessException("PERIOD_NOT_FOUND", "假期周期不存在");
                }
                assertPeriodMutable(current, payload, hMapper.pendingLeave(tenantId(), periodId),
                        ledgerMapper.selectCount(new LambdaQueryWrapper<HrLeaveLedger>().eq(HrLeaveLedger::getTenantId, tenantId())
                                .eq(HrLeaveLedger::getLeavePeriodId, periodId)));
            }
            if (flag(payload.getDefaultFlag())) periodMapper.update(null, new LambdaUpdateWrapper<HrLeavePeriod>()
                    .eq(HrLeavePeriod::getTenantId, tenantId()).set(HrLeavePeriod::getDefaultFlag, 0));
            Map<String, Object> fields = support.configurationPayload(payload, "periodId");
            if (periodId == null) return crudService.create(HrLeavePeriod.class, fields);
            crudService.update(HrLeavePeriod.class, periodId, fields);
            return periodId;
        });
    }

    static void assertPeriodMutable(HrLeavePeriod current, HrLeavePeriod payload, long pendingOvertimes, long ledgerCount) {
        if (Objects.equals(current.getStartDate(), payload.getStartDate()) && Objects.equals(current.getEndDate(), payload.getEndDate())
                && Objects.equals(current.getStatus(), payload.getStatus())) return;
        if (pendingOvertimes > 0) throw new HrBusinessException("OVERTIME_SETTLEMENT_PENDING", "假期周期存在未结算加班调休，不能修改日期或状态");
        if (ledgerCount > 0) throw new HrBusinessException("PERIOD_IN_USE", "已有台账的周期不可直接修改日期或状态，关闭由结转任务完成");
    }

    public Long savePolicy(Long policyId, HrLeavePolicy payload) {
        if (payload == null || !StringUtils.hasText(payload.getPolicyCode()) || !StringUtils.hasText(payload.getPolicyName())) {
            throw new HrBusinessException("INVALID_POLICY", "政策编码和名称不能为空");
        }
        return support.locked("leave-configuration", () -> {
            if (policyId != null) requirePolicy(policyId);
            if (payload.getStatus() == null) payload.setStatus("DRAFT");
            if (!List.of("DRAFT", "ACTIVE", "INACTIVE").contains(payload.getStatus())) throw new HrBusinessException("INVALID_STATUS", "政策状态无效");
            Map<String, Object> fields = support.configurationPayload(payload, "policyId");
            if (policyId == null) return crudService.create(HrLeavePolicy.class, fields);
            crudService.update(HrLeavePolicy.class, policyId, fields);
            return policyId;
        });
    }

    public void saveDetails(Long policyId, List<HrLeavePolicyDetail> details) {
        if (details == null || details.isEmpty()) throw new HrBusinessException("EMPTY_POLICY", "政策至少需要一种假期额度");
        support.locked("leave-configuration", () -> {
            requirePolicy(policyId);
            if (assignmentMapper.selectCount(new LambdaQueryWrapper<HrLeavePolicyAssignment>()
                    .eq(HrLeavePolicyAssignment::getTenantId, tenantId()).eq(HrLeavePolicyAssignment::getPolicyId, policyId)
                    .eq(HrLeavePolicyAssignment::getDeleted, 0)) > 0) throw new HrBusinessException("POLICY_IN_USE", "已分配的政策请保留历史明细，并新建政策调整");
            Set<Long> types = new HashSet<>();
            for (HrLeavePolicyDetail detail : details) {
                HrLeaveType type = requireType(detail.getLeaveTypeId());
                if (!types.add(type.getId()) || detail.getAnnualDays() == null || detail.getAnnualDays().signum() < 0
                        || (!flag(type.getAllowOverAllocationFlag()) && type.getMaxDaysPerYear() != null
                        && detail.getAnnualDays().compareTo(type.getMaxDaysPerYear()) > 0)) {
                    throw new HrBusinessException("INVALID_POLICY_DETAIL", "政策假期不可重复，额度须在允许范围内");
                }
                List<HrLeavePolicyDetail> current = detailMapper.selectList(new LambdaQueryWrapper<HrLeavePolicyDetail>()
                        .eq(HrLeavePolicyDetail::getTenantId, tenantId()).eq(HrLeavePolicyDetail::getPolicyId, policyId)
                        .eq(HrLeavePolicyDetail::getLeaveTypeId, type.getId()));
                Map<String, Object> fields = Map.of("policyId", policyId, "leaveTypeId", type.getId(), "annualDays", amount(detail.getAnnualDays()));
                if (current.isEmpty()) crudService.create(HrLeavePolicyDetail.class, fields);
                else {
                    detailMapper.update(null, new LambdaUpdateWrapper<HrLeavePolicyDetail>().eq(HrLeavePolicyDetail::getTenantId, tenantId())
                            .eq(HrLeavePolicyDetail::getDetailId, current.get(0).getDetailId()).set(HrLeavePolicyDetail::getDeleted, 0));
                    crudService.update(HrLeavePolicyDetail.class, current.get(0).getDetailId(), fields);
                }
            }
            detailMapper.update(null, new LambdaUpdateWrapper<HrLeavePolicyDetail>().eq(HrLeavePolicyDetail::getTenantId, tenantId())
                    .eq(HrLeavePolicyDetail::getPolicyId, policyId).notIn(HrLeavePolicyDetail::getLeaveTypeId, types)
                    .set(HrLeavePolicyDetail::getDeleted, 1));
            return null;
        });
    }

    public int assign(HrLeavePolicyAssignRequest payload) {
        if (payload == null || !List.of("PERIOD", "JOINING_DATE").contains(payload.getAssignmentBasis())) {
            throw new HrBusinessException("INVALID_ASSIGNMENT", "请选择按周期或按入职日分配");
        }
        HrLeavePolicy policy = requirePolicy(payload.getPolicyId());
        HrLeavePeriod period = requirePeriod(payload.getPeriodId());
        if (!"ACTIVE".equals(policy.getStatus()) || !"OPEN".equals(period.getStatus())) throw new HrBusinessException("INACTIVE_POLICY", "政策须已启用且周期须开放");
        List<HrEmployee> employees = support.selectEmployees(payload);
        if (employees.isEmpty()) throw new HrBusinessException("NO_EMPLOYEES", "筛选范围内没有可分配员工");
        int count = 0;
        for (HrEmployee employee : employees) {
            count += support.locked("leave-policy:" + employee.getId() + ":" + period.getPeriodId(), () -> {
                if (assignmentMapper.selectCount(new LambdaQueryWrapper<HrLeavePolicyAssignment>()
                        .eq(HrLeavePolicyAssignment::getTenantId, tenantId()).eq(HrLeavePolicyAssignment::getEmployeeId, employee.getId())
                        .eq(HrLeavePolicyAssignment::getLeavePeriodId, period.getPeriodId()).eq(HrLeavePolicyAssignment::getDeleted, 0)) > 0) return 0;
                LocalDate from = payload.getEffectiveFrom() == null ? period.getStartDate() : payload.getEffectiveFrom();
                LocalDate to = payload.getEffectiveTo() == null ? period.getEndDate() : payload.getEffectiveTo();
                if ("JOINING_DATE".equals(payload.getAssignmentBasis()) && employee.getHireDate() != null && employee.getHireDate().isAfter(from)) from = employee.getHireDate();
                if (from.isBefore(period.getStartDate()) || to.isAfter(period.getEndDate()) || to.isBefore(from)) {
                    throw new HrBusinessException("INVALID_EFFECTIVE_DATE", "分配生效日期须在假期周期内");
                }
                HrLeavePolicyAssignment assignment = new HrLeavePolicyAssignment();
                assignment.setTenantId(tenantId());
                assignment.setEmployeeId(employee.getId());
                assignment.setPolicyId(policy.getPolicyId());
                assignment.setLeavePeriodId(period.getPeriodId());
                assignment.setAssignmentBasis(payload.getAssignmentBasis());
                assignment.setEffectiveFrom(from);
                assignment.setEffectiveTo(to);
                assignment.setCarryForwardFlag(flag(payload.getCarryForwardFlag()) ? 1 : 0);
                assignment.setAllocatedFlag(0);
                assignment.setStatus("ACTIVE");
                assignment.setDeleted(0);
                assignment.setVersion(0);
                assignment.setCreateBy(userName());
                assignment.setCreateTime(LocalDateTime.now());
                assignmentMapper.insert(assignment);
                support.audit("LEAVE_POLICY", assignment.getAssignmentId(), "ASSIGN", Map.of("employeeId", employee.getId(), "policyId", policy.getPolicyId()));
                return 1;
            });
        }
        leaveService.allocatePolicies(LocalDate.now());
        return count;
    }

    public Long saveType(Long typeId, HrLeaveTypePayload payload) {
        if (payload == null || !StringUtils.hasText(payload.getLeaveCode()) || !StringUtils.hasText(payload.getLeaveName())
                || !List.of("DAY", "HOUR").contains(String.valueOf(payload.getUnit()))) throw new HrBusinessException("INVALID_LEAVE_TYPE", "请填写假期编码、名称及DAY/HOUR单位");
        return support.locked("leave-configuration", () -> {
            if (typeId != null) {
                HrLeaveType current = requireType(typeId);
                if (!Objects.equals(current.getUnit(), payload.getUnit()) && (ledgerMapper.selectCount(new LambdaQueryWrapper<HrLeaveLedger>()
                        .eq(HrLeaveLedger::getTenantId, tenantId()).eq(HrLeaveLedger::getLeaveTypeId, typeId)) > 0
                        || requestMapper.selectCount(new LambdaQueryWrapper<HrTimeRequest>().eq(HrTimeRequest::getTenantId, tenantId())
                        .eq(HrTimeRequest::getLeaveTypeId, typeId)) > 0)) {
                    throw new HrBusinessException("LEAVE_UNIT_IN_USE", "已有请假申请或台账的假期不能更改数量单位");
                }
            }
            for (BigDecimal limit : new BigDecimal[]{payload.getMaxDaysPerYear(), payload.getMaxContinuousDays(), payload.getMaxCarryForwardDays()}) {
                if (limit != null && limit.signum() < 0) throw new HrBusinessException("INVALID_LEAVE_LIMIT", "假期数量上限不能为负数");
            }
            if (payload.getApplicableAfterDays() != null && payload.getApplicableAfterDays() < 0
                    || payload.getCarryForwardExpireDays() != null && payload.getCarryForwardExpireDays() <= 0) {
                throw new HrBusinessException("INVALID_LEAVE_LIMIT", "入职等待天数不可为负，结转有效天数须为正数");
            }
            if (flag(payload.getPartialPaidFlag()) && (payload.getSalaryFractionPerDay() == null
                    || payload.getSalaryFractionPerDay().signum() < 0 || payload.getSalaryFractionPerDay().compareTo(BigDecimal.ONE) > 0)) {
                throw new HrBusinessException("INVALID_SALARY_FRACTION", "部分带薪比例须为0至1");
            }
            if (flag(payload.getEarnedLeaveFlag()) && !List.of("MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY").contains(String.valueOf(payload.getEarnedLeaveFrequency()))) {
                throw new HrBusinessException("INVALID_ACCRUAL_FREQUENCY", "请选择有效的累积频率");
            }
            if (payload.getRoundingMode() == null) payload.setRoundingMode("NONE");
            if (!List.of("NONE", "HALF_DAY", "FULL_DAY").contains(payload.getRoundingMode())
                    || "HOUR".equals(payload.getUnit()) && !"NONE".equals(payload.getRoundingMode())) {
                throw new HrBusinessException("INVALID_ROUNDING", "小时假保留两位小数，天数假可按半天或全天取整");
            }
            if (flag(payload.getEncashmentFlag()) && payload.getEncashmentComponentId() == null) throw new HrBusinessException("ENCASHMENT_COMPONENT_REQUIRED", "折现假期须指定薪酬项");
            if (flag(payload.getEncashmentFlag())) encashmentComponents.requireComponent(payload.getEncashmentComponentId());
            Map<String, Object> fields = support.configurationPayload(payload, "id");
            preserveTypeDefaults(fields);
            if (typeId == null) return crudService.create(HrLeaveType.class, fields);
            crudService.update(HrLeaveType.class, typeId, fields);
            return typeId;
        });
    }

    static void preserveTypeDefaults(Map<String, Object> fields) {
        for (String field : List.of("needQuota", "isPaid", "applicableAfterDays", "carryForwardFlag", "earnedLeaveFlag",
                "earnedLeaveFrequency", "encashmentFlag", "lwpFlag", "partialPaidFlag", "salaryFractionPerDay",
                "compensatoryFlag", "optionalLeaveFlag", "includeHolidayFlag", "allowNegativeFlag",
                "allowOverAllocationFlag", "needAttachmentFlag", "status")) {
            if (fields.get(field) == null) fields.remove(field);
        }
    }

    private HrLeavePeriod requirePeriod(Long id) {
        HrLeavePeriod row = id == null ? null : periodMapper.selectById(id);
        if (row == null || !Objects.equals(tenantId(), row.getTenantId()) || flag(row.getDeleted())) throw new HrBusinessException("PERIOD_NOT_FOUND", "假期周期不存在");
        return row;
    }

    private HrLeavePolicy requirePolicy(Long id) {
        HrLeavePolicy row = id == null ? null : policyMapper.selectById(id);
        if (row == null || !Objects.equals(tenantId(), row.getTenantId()) || flag(row.getDeleted())) throw new HrBusinessException("POLICY_NOT_FOUND", "假期政策不存在");
        return row;
    }

    private HrLeaveType requireType(Long id) {
        HrLeaveType row = id == null ? null : typeMapper.selectById(id);
        if (row == null || !Objects.equals(tenantId(), row.getTenantId())) throw new HrBusinessException("LEAVE_TYPE_NOT_FOUND", "假期类型不存在");
        return row;
    }
}

package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.dto.HrEmployeeSelection;
import com.cloudflow.hr.mapper.HrPositionMapper;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrAuditLogMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class HrRuleSupport {
    private final PlatformTransactionManager transactionManager;
    private final RedissonClient redissonClient;
    private final HrEmployeeMapper employeeMapper;
    private final HrAuditLogMapper auditLogMapper;
    private final ObjectMapper objectMapper;
    private final HrPositionMapper positionMapper;

    public <T> T locked(String resource, Supplier<T> action) {
        RLock lock = redissonClient.getLock("cloudflow:hr:rules:" + tenantId() + ":" + resource);
        AtomicBoolean releaseOnCompletion = new AtomicBoolean();
        boolean acquired = false;
        try {
            acquired = lock.tryLock(3, TimeUnit.SECONDS);
            if (!acquired) throw new HrBusinessException("HR_RESOURCE_BUSY", "该员工的数据正在处理中，请稍后重试");
            return transaction(() -> {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCompletion(int status) {
                        if (lock.isHeldByCurrentThread()) lock.unlock();
                    }
                });
                releaseOnCompletion.set(true);
                return action.get();
            });
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new HrBusinessException("HR_RESOURCE_BUSY", "等待数据锁时被中断", exception);
        } finally {
            if (acquired && !releaseOnCompletion.get() && lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    public <T> T transaction(Supplier<T> action) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        return template.execute(status -> action.get());
    }

    public <T> T lockedWithoutTransaction(String resource, Supplier<T> action) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
        return template.execute(status -> {
            RLock lock = redissonClient.getLock("cloudflow:hr:rules:" + tenantId() + ":" + resource);
            boolean acquired = false;
            try {
                acquired = lock.tryLock(3, TimeUnit.SECONDS);
                if (!acquired) throw new HrBusinessException("HR_RESOURCE_BUSY", "审批状态正在处理中，请稍后重试");
                return action.get();
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new HrBusinessException("HR_RESOURCE_BUSY", "等待审批状态锁时被中断", exception);
            } finally {
                if (acquired && lock.isHeldByCurrentThread()) lock.unlock();
            }
        });
    }

    public void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) { action.run(); return; }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() { action.run(); }
        });
    }

    public HrEmployee employee(Long employeeId) {
        HrEmployee employee = employeeId == null ? null : employeeMapper.selectById(employeeId);
        if (employee == null || !Objects.equals(tenantId(), employee.getTenantId())
                || flag(employee.getDeleted())) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }
        return employee;
    }

    public void assertEmployeeScope(Long employeeId) {
        employeeInScope(employeeId);
    }

    public HrEmployee employeeInScope(Long employeeId) {
        HrEmployee employee = employee(employeeId);
        assertLoadedEmployeeScope(employee);
        return employee;
    }

    /** Only fields consumed by attendance selection, scope checks and employment dates. */
    public HrEmployee attendanceEmployeeInScope(Long employeeId) {
        HrEmployee employee = employeeId == null ? null : employeeMapper.selectAttendanceById(tenantId(), employeeId);
        assertLoadedEmployeeScope(employee);
        return employee;
    }

    private void assertLoadedEmployeeScope(HrEmployee employee) {
        if (employee == null || !Objects.equals(tenantId(), employee.getTenantId()) || flag(employee.getDeleted())) {
            throw new HrBusinessException("EMPLOYEE_NOT_FOUND", "员工不存在");
        }
        Integer scope = UserContext.getDsType();
        if (UserContext.getUserId() == null || scope == null || scope == 0) return;
        boolean allowed = switch (scope) {
            case 1, 2 -> UserContext.getDsDeptIds().contains(employee.getDeptId());
            case 3 -> Objects.equals(UserContext.getDeptId(), employee.getDeptId());
            case 4 -> Objects.equals(UserContext.getUserId(), employee.getUserId());
            default -> false;
        };
        if (!allowed) throw new HrBusinessException("FORBIDDEN", "无权访问该员工的数据");
    }

    public List<HrEmployee> employees(List<Long> employeeIds, List<Long> deptIds) {
        return employees(employeeIds, deptIds, false);
    }

    private List<HrEmployee> employees(List<Long> employeeIds, List<Long> deptIds, boolean attendanceOnly) {
        List<HrEmployee> candidates;
        if (attendanceOnly) {
            if (employeeIds != null && employeeIds.size() == 1 && (deptIds == null || deptIds.isEmpty())) {
                HrEmployee employee = employeeMapper.selectAttendanceById(tenantId(), employeeIds.get(0));
                candidates = employee == null ? List.of() : List.of(employee);
            } else {
                candidates = employeeMapper.selectAttendanceCandidates(tenantId(), employeeIds, deptIds);
            }
        } else {
            LambdaQueryWrapper<HrEmployee> query = new LambdaQueryWrapper<HrEmployee>()
                    .eq(HrEmployee::getTenantId, tenantId()).eq(HrEmployee::getDeleted, 0)
                    .in(employeeIds != null && !employeeIds.isEmpty(), HrEmployee::getId, employeeIds)
                    .in(deptIds != null && !deptIds.isEmpty(), HrEmployee::getDeptId, deptIds)
                    .orderByAsc(HrEmployee::getId);
            candidates = employeeMapper.selectList(query);
        }
        return candidates.stream().filter(employee -> {
            try { assertLoadedEmployeeScope(employee); return true; }
            catch (HrBusinessException exception) { return false; }
        }).toList();
    }

    public void audit(String domain, Long businessId, String operation, Object detail) {
        try {
            auditLogMapper.insertLog(tenantId(), domain, businessId, operation, UserContext.getUserId(),
                    userName(), null, objectMapper.writeValueAsString(detail == null ? Map.of() : detail));
        } catch (JsonProcessingException exception) {
            throw new HrBusinessException("AUDIT_SERIALIZATION_FAILED", "审计记录生成失败", exception);
        }
    }

    public Map<String, Object> auditDetail(String domain, Long businessId, String operation) {
        String json = auditLogMapper.selectLatestAfterData(tenantId(), domain, businessId, operation);
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException exception) {
            throw new HrBusinessException("AUDIT_SNAPSHOT_INVALID", "业务历史快照无法读取，请联系管理员核对", exception);
        }
    }

    public List<HrEmployee> selectEmployees(HrEmployeeSelection selection) {
        return selectEmployees(selection, false);
    }

    public List<HrEmployee> selectAttendanceEmployees(HrEmployeeSelection selection) {
        return selectEmployees(selection, true);
    }

    private List<HrEmployee> selectEmployees(HrEmployeeSelection selection, boolean attendanceOnly) {
        if (selection == null) throw new HrBusinessException("INVALID_PARAMETER", "员工筛选条件不能为空");
        List<HrEmployee> employees = employees(selection.getEmployeeIds(), selection.getDeptIds(), attendanceOnly);
        java.util.Set<Long> positions = new java.util.HashSet<>();
        if (selection.getJobLevelIds() != null && !selection.getJobLevelIds().isEmpty()) {
            for (HrPosition position : positionMapper.selectList(new LambdaQueryWrapper<HrPosition>()
                    .eq(HrPosition::getTenantId, tenantId()).in(HrPosition::getLevelId, selection.getJobLevelIds()))) {
                positions.add(position.getId());
            }
        }
        return employees.stream().filter(employee -> selection.getPositionIds() == null || selection.getPositionIds().isEmpty()
                        || selection.getPositionIds().contains(employee.getPositionId()))
                .filter(employee -> selection.getJobLevelIds() == null || selection.getJobLevelIds().isEmpty()
                        || positions.contains(employee.getPositionId()))
                .filter(employee -> selection.getEmployeeType() == null || selection.getEmployeeType().isBlank()
                        || selection.getEmployeeType().equals(employee.getEmployeeType())).toList();
    }

    public Map<String, Object> configurationPayload(Object payload, String primaryKey) {
        Map<String, Object> fields = objectMapper.convertValue(payload,
                new com.fasterxml.jackson.core.type.TypeReference<java.util.LinkedHashMap<String, Object>>() {});
        for (String field : List.of(primaryKey, "tenantId", "deleted", "createBy", "createTime", "updateBy", "updateTime", "version")) {
            fields.remove(field);
        }
        return fields;
    }

    public static Long tenantId() {
        Long tenant = TenantContext.getTenantId();
        if (tenant == null) tenant = UserContext.getTenantId();
        if (tenant == null) throw new HrBusinessException("TENANT_REQUIRED", "缺少租户上下文");
        return tenant;
    }

    public static String userName() {
        return UserContext.getUserName() == null ? "system" : UserContext.getUserName();
    }

    public static boolean flag(Integer value) { return Integer.valueOf(1).equals(value); }

    public static BigDecimal amount(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}

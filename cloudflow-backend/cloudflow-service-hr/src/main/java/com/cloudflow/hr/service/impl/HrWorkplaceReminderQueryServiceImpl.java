package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrLifecycleTask;
import com.cloudflow.hr.domain.vo.HrWorkplaceReminderVO;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.mapper.HrLifecycleTaskMapper;
import com.cloudflow.hr.service.IHrWorkplaceReminderQueryService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkplaceReminderQueryServiceImpl implements IHrWorkplaceReminderQueryService {

    private static final String TYPE_CONTRACT_EXPIRING = "CONTRACT_EXPIRING";
    private static final String TYPE_LIFECYCLE_TASK = "LIFECYCLE_TASK";
    private static final List<String> ACTIVE_CONTRACT_STATUSES = List.of("ACTIVE", "EFFECTIVE", "EXPIRING");

    private final HrEmployeeMapper employeeMapper;
    private final HrEmployeeContractMapper contractMapper;
    private final HrLifecycleTaskMapper lifecycleTaskMapper;
    private final com.cloudflow.common.redis.core.SysConfigHelper sysConfigHelper;

    @Override
    public List<HrWorkplaceReminderVO> listReminders(Long userId, int expiringDays, int limit) {
        int days = expiringDays > 0 ? expiringDays : 30;
        int max = limit > 0 ? limit : 10;

        List<HrWorkplaceReminderVO> items = new ArrayList<>();
        items.addAll(loadContractReminders(userId, days));
        items.addAll(loadLifecycleTaskReminders(userId));

        items.sort(Comparator.comparing(HrWorkplaceReminderVO::getDueDate,
                Comparator.nullsLast(Comparator.naturalOrder())));
        if (items.size() > max) {
            return new ArrayList<>(items.subList(0, max));
        }
        return items;
    }

    private List<HrWorkplaceReminderVO> loadContractReminders(Long userId, int days) {
        Long employeeId = resolveEmployeeId(userId);
        if (employeeId == null) {
            return List.of();
        }
        LocalDate today = LocalDate.now();
        LocalDate threshold = today.plusDays(days);
        try {
            List<HrEmployeeContract> contracts = contractMapper.selectList(Wrappers.<HrEmployeeContract>lambdaQuery()
                    .eq(HrEmployeeContract::getEmployeeId, employeeId)
                    .between(HrEmployeeContract::getEndDate, today, threshold)
                    .in(HrEmployeeContract::getStatus, ACTIVE_CONTRACT_STATUSES)
                    .eq(HrEmployeeContract::getDeleted, 0));
            List<HrWorkplaceReminderVO> result = new ArrayList<>(contracts.size());
            for (HrEmployeeContract contract : contracts) {
                HrWorkplaceReminderVO vo = new HrWorkplaceReminderVO();
                vo.setId(TYPE_CONTRACT_EXPIRING + "-" + contract.getId());
                vo.setType(TYPE_CONTRACT_EXPIRING);
                vo.setSourceLabel("HR · 合同到期");
                vo.setTitle("合同即将到期");
                vo.setDescription(buildContractDescription(contract, today));
                vo.setDueDate(contract.getEndDate());
                vo.setSeverity(resolveSeverity(contract.getEndDate(), today));
                vo.setBusinessId(contract.getId());
                vo.setBusinessType("HR_CONTRACT");
                vo.setPath("/hr/ess/contract");
                result.add(vo);
            }
            return result;
        } catch (Exception e) {
            log.warn("加载合同到期提醒失败: {}", e.getMessage());
            return List.of();
        }
    }

    private List<HrWorkplaceReminderVO> loadLifecycleTaskReminders(Long userId) {
        if (userId == null) {
            return List.of();
        }
        try {
            List<HrLifecycleTask> tasks = lifecycleTaskMapper.selectList(Wrappers.<HrLifecycleTask>lambdaQuery()
                    .eq(HrLifecycleTask::getOwnerId, userId)
                    .eq(HrLifecycleTask::getStatus, "PENDING"));
            LocalDate today = LocalDate.now();
            List<HrWorkplaceReminderVO> result = new ArrayList<>(tasks.size());
            for (HrLifecycleTask task : tasks) {
                HrWorkplaceReminderVO vo = new HrWorkplaceReminderVO();
                vo.setId(TYPE_LIFECYCLE_TASK + "-" + task.getId());
                vo.setType(TYPE_LIFECYCLE_TASK);
                vo.setSourceLabel("HR · 入离调任务");
                vo.setTitle(task.getTaskName() != null ? task.getTaskName() : "待办任务");
                vo.setDescription(task.getRemark());
                vo.setDueDate(task.getDueDate());
                vo.setSeverity(resolveSeverity(task.getDueDate(), today));
                vo.setBusinessId(task.getId());
                vo.setBusinessType("HR_LIFECYCLE_TASK");
                vo.setPath("/hr/lifecycle");
                result.add(vo);
            }
            return result;
        } catch (Exception e) {
            log.warn("加载生命周期任务提醒失败: {}", e.getMessage());
            return List.of();
        }
    }

    private String buildContractDescription(HrEmployeeContract contract, LocalDate today) {
        if (contract.getEndDate() == null) {
            return "合同 " + safe(contract.getContractNo());
        }
        long remaining = ChronoUnit.DAYS.between(today, contract.getEndDate());
        return String.format("合同 %s 将在 %d 天后到期", safe(contract.getContractNo()), remaining);
    }

    private String resolveSeverity(LocalDate dueDate, LocalDate today) {
        if (dueDate == null) {
            return "LOW";
        }
        long days = ChronoUnit.DAYS.between(today, dueDate);
        if (days <= sysConfigHelper.getConfigInt("sys.hr.workplace.reminderDaysHigh", 7)) {
            return "HIGH";
        }
        if (days <= sysConfigHelper.getConfigInt("sys.hr.workplace.reminderDays", 15)) {
            return "MEDIUM";
        }
        return "LOW";
    }

    private Long resolveEmployeeId(Long userId) {
        if (userId == null) {
            return null;
        }
        HrEmployee employee = employeeMapper.selectPage(new Page<>(1, 1, false), Wrappers.<HrEmployee>lambdaQuery()
                .eq(HrEmployee::getUserId, userId)
                .eq(HrEmployee::getDeleted, 0))
                .getRecords().stream().findFirst().orElse(null);
        return employee == null ? null : employee.getId();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}

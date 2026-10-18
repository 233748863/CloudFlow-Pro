package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectTask;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaProjectTaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ProjectExecutionStateService {

    private final OaProjectMapper projectMapper;
    private final OaProjectTaskMapper projectTaskMapper;

    public void syncProjectStatus(Long projectId, String updateBy) {
        if (projectId == null) {
            return;
        }
        OaProject project = projectMapper.selectById(projectId);
        if (project == null || !Integer.valueOf(0).equals(project.getDeleted())) {
            return;
        }
        if ("DRAFT".equalsIgnoreCase(project.getStatus())
                || "PENDING".equalsIgnoreCase(project.getStatus())
                || "REJECTED".equalsIgnoreCase(project.getStatus())
                || "ARCHIVED".equalsIgnoreCase(project.getStatus())
                || "CANCELLED".equalsIgnoreCase(project.getStatus())) {
            return;
        }

        List<OaProjectTask> tasks = projectTaskMapper.selectList(new LambdaQueryWrapper<OaProjectTask>()
                .eq(OaProjectTask::getTenantId, project.getTenantId())
                .eq(OaProjectTask::getProjectId, projectId)
                .eq(OaProjectTask::getDeleted, 0));
        boolean hasDeliverables = !tasks.isEmpty();
        boolean hasStarted = tasks.stream().anyMatch(this::isTaskStarted);
        boolean allComplete = hasDeliverables && tasks.stream().allMatch(this::isTaskCompleted);

        String targetStatus;
        if (allComplete) {
            targetStatus = "COMPLETED";
        } else if (hasStarted || "COMPLETED".equalsIgnoreCase(project.getStatus())) {
            targetStatus = "IN_PROGRESS";
        } else {
            targetStatus = "APPROVED";
        }

        BigDecimal targetProgress = resolveProjectProgress(project, tasks, targetStatus);
        LocalDate targetActualStartDate = hasStarted
                ? (project.getActualStartDate() != null ? project.getActualStartDate() : LocalDate.now())
                : project.getActualStartDate();
        LocalDate targetActualEndDate = "COMPLETED".equals(targetStatus) ? LocalDate.now() : null;

        boolean statusChanged = !targetStatus.equalsIgnoreCase(project.getStatus());
        boolean progressChanged = project.getProgress() == null || project.getProgress().compareTo(targetProgress) != 0;
        boolean startChanged = !sameDate(project.getActualStartDate(), targetActualStartDate);
        boolean endChanged = !sameDate(project.getActualEndDate(), targetActualEndDate);
        if (!statusChanged && !progressChanged && !startChanged && !endChanged) {
            return;
        }

        LambdaUpdateWrapper<OaProject> wrapper = new LambdaUpdateWrapper<OaProject>()
                .eq(OaProject::getProjectId, projectId)
                .set(OaProject::getStatus, targetStatus)
                .set(OaProject::getProgress, targetProgress)
                .set(OaProject::getActualStartDate, targetActualStartDate)
                .set(OaProject::getActualEndDate, targetActualEndDate)
                .set(OaProject::getUpdateBy, updateBy)
                .set(OaProject::getUpdateTime, LocalDateTime.now());
        projectMapper.update(null, wrapper);
    }

    private BigDecimal resolveProjectProgress(OaProject project, List<OaProjectTask> tasks, String targetStatus) {
        if ("COMPLETED".equalsIgnoreCase(targetStatus)) return BigDecimal.valueOf(100);
        String mode = project.getPercentCompleteMode() == null ? "TASK_COMPLETION" : project.getPercentCompleteMode();
        BigDecimal current = project.getProgress() == null ? BigDecimal.ZERO : project.getProgress();
        return switch (mode) {
            case "MANUAL" -> current;
            case "TASK_PROGRESS" -> {
                if (tasks.isEmpty()) yield current;
                BigDecimal weights = tasks.stream().map(task -> task.getTaskWeight() == null ? BigDecimal.ONE : task.getTaskWeight()).reduce(BigDecimal.ZERO, BigDecimal::add);
                if (weights.signum() == 0) yield BigDecimal.ZERO;
                BigDecimal weighted = tasks.stream().map(task -> (task.getTaskWeight() == null ? BigDecimal.ONE : task.getTaskWeight())
                        .multiply(task.getProgress() == null ? BigDecimal.ZERO : task.getProgress())).reduce(BigDecimal.ZERO, BigDecimal::add);
                yield weighted.divide(weights, 2, RoundingMode.HALF_UP);
            }
            case "TASK_COMPLETION" -> tasks.isEmpty() ? current : completionRate(tasks.stream().filter(this::isTaskCompleted).count(), tasks.size());
            default -> throw new IllegalArgumentException("项目进度模式无效");
        };
    }

    private BigDecimal completionRate(long completed, long total) {
        if (total <= 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(completed)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
    }





    private boolean isTaskStarted(OaProjectTask task) {
        return task != null && (isTaskCompleted(task) || "IN_PROGRESS".equalsIgnoreCase(task.getStatus()) || task.getActualStart() != null
                || task.getProgress() != null && task.getProgress().signum() > 0);
    }

    private boolean isTaskCompleted(OaProjectTask task) {
        return task != null && "COMPLETED".equalsIgnoreCase(task.getStatus());
    }

    private boolean sameDate(LocalDate left, LocalDate right) {
        if (left == null && right == null) {
            return true;
        }
        if (left == null || right == null) {
            return false;
        }
        return left.isEqual(right);
    }
}

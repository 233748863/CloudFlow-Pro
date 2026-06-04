package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectMilestone;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.mapper.OaProjectMapper;
import com.cloudflow.oa.mapper.OaProjectMilestoneMapper;
import com.cloudflow.oa.mapper.WorkTaskMapper;
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
    private final OaProjectMilestoneMapper milestoneMapper;
    private final WorkTaskMapper workTaskMapper;

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

        List<OaProjectMilestone> milestones = milestoneMapper.selectList(new LambdaQueryWrapper<OaProjectMilestone>()
                .eq(OaProjectMilestone::getProjectId, projectId)
                .eq(OaProjectMilestone::getDeleted, "0"));
        List<WorkTask> tasks = workTaskMapper.selectList(new LambdaQueryWrapper<WorkTask>()
                .eq(WorkTask::getProjectId, projectId)
                .eq(WorkTask::getDeleted, 0));

        boolean hasDeliverables = !milestones.isEmpty() || !tasks.isEmpty();
        boolean hasStarted = milestones.stream().anyMatch(this::isMilestoneStarted)
                || tasks.stream().anyMatch(this::isTaskStarted);
        boolean milestonesComplete = milestones.isEmpty() || milestones.stream().allMatch(this::isMilestoneCompleted);
        boolean tasksComplete = tasks.isEmpty() || tasks.stream().allMatch(this::isTaskCompleted);
        boolean allComplete = hasDeliverables && milestonesComplete && tasksComplete;

        String targetStatus;
        if (allComplete) {
            targetStatus = "COMPLETED";
        } else if (hasStarted || "COMPLETED".equalsIgnoreCase(project.getStatus())) {
            targetStatus = "IN_PROGRESS";
        } else {
            targetStatus = "APPROVED";
        }

        BigDecimal targetProgress = resolveProjectProgress(project, milestones, tasks, targetStatus);
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

    private BigDecimal resolveProjectProgress(OaProject project,
                                              List<OaProjectMilestone> milestones,
                                              List<WorkTask> tasks,
                                              String targetStatus) {
        if ("COMPLETED".equalsIgnoreCase(targetStatus)) {
            return BigDecimal.valueOf(100);
        }
        if (!tasks.isEmpty() && !milestones.isEmpty()) {
            return completionRate(tasks.stream().filter(this::isTaskCompleted).count() + milestones.stream().filter(this::isMilestoneCompleted).count(),
                    tasks.size() + milestones.size());
        }
        if (!tasks.isEmpty()) {
            return completionRate(tasks.stream().filter(this::isTaskCompleted).count(), tasks.size());
        }
        if (!milestones.isEmpty()) {
            return completionRate(milestones.stream().filter(this::isMilestoneCompleted).count(), milestones.size());
        }
        return project.getProgress() == null ? BigDecimal.ZERO : project.getProgress();
    }

    private BigDecimal completionRate(long completed, long total) {
        if (total <= 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(completed)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP);
    }

    private boolean isMilestoneStarted(OaProjectMilestone milestone) {
        return milestone != null && (isMilestoneCompleted(milestone)
                || "IN_PROGRESS".equalsIgnoreCase(milestone.getStatus())
                || (milestone.getProgress() != null && milestone.getProgress().compareTo(BigDecimal.ZERO) > 0));
    }

    private boolean isMilestoneCompleted(OaProjectMilestone milestone) {
        return milestone != null && (milestone.getActualDate() != null
                || "DONE".equalsIgnoreCase(milestone.getStatus())
                || "COMPLETED".equalsIgnoreCase(milestone.getStatus())
                || "COMPLETED_MILESTONE".equalsIgnoreCase(milestone.getStatus()));
    }

    private boolean isTaskStarted(WorkTask task) {
        return task != null && (isTaskCompleted(task)
                || "DOING".equalsIgnoreCase(task.getStatus())
                || task.getActualStartTime() != null
                || (task.getProgress() != null && task.getProgress().compareTo(BigDecimal.ZERO) > 0));
    }

    private boolean isTaskCompleted(WorkTask task) {
        return task != null && "DONE".equalsIgnoreCase(task.getStatus());
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

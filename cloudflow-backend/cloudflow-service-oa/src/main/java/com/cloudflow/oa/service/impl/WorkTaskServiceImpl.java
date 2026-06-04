package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.StringUtils;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.mapper.WorkTaskMapper;
import com.cloudflow.oa.service.IWorkTaskService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * 协作任务 Service 实现类
 */
@Service
@RequiredArgsConstructor
public class WorkTaskServiceImpl extends ServiceImpl<WorkTaskMapper, WorkTask> implements IWorkTaskService {

    private static final Set<String> ALLOWED_STATUS = Set.of("TODO", "DOING", "DONE", "CANCELLED");
    private final ProjectExecutionStateService projectExecutionStateService;

    @Override
    public List<WorkTask> getMyTasks(Long userId, String status) {
        LambdaQueryWrapper<WorkTask> wrapper = new LambdaQueryWrapper<>();
        // 查询负责人是当前用户 OR 创建人是当前用户
        wrapper.and(w -> w.eq(WorkTask::getAssigneeId, userId)
                        .or()
                        .eq(WorkTask::getOwnerId, userId));
        
        if (StringUtils.isNotEmpty(status)) {
            wrapper.eq(WorkTask::getStatus, status);
        }
        
        // 按创建时间倒序
        wrapper.orderByDesc(WorkTask::getCreateTime);
        
        return list(wrapper);
    }

    @Override
    @Audit(name = "更新任务状态", spel = "@workTaskServiceImpl.getById(#taskId)", oldVal = "@workTaskServiceImpl.getById(#taskId)", diff = true, highRisk = true)
    public boolean updateStatus(Long taskId, String status) {
        WorkTask existing = requireTask(taskId);
        String nextStatus = normalizeStatus(status);
        validateTransition(existing, nextStatus);

        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<WorkTask> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(WorkTask::getTaskId, taskId)
                .eq(WorkTask::getDeleted, 0)
                .set(WorkTask::getStatus, nextStatus)
                .set(WorkTask::getUpdateTime, now);

        if ("DOING".equals(nextStatus) && existing.getActualStartTime() == null) {
            wrapper.set(WorkTask::getActualStartTime, now);
        }
        if ("DONE".equals(nextStatus)) {
            if (existing.getActualStartTime() == null) {
                wrapper.set(WorkTask::getActualStartTime, now);
            }
            wrapper.set(WorkTask::getActualEndTime, now);
            wrapper.set(WorkTask::getProgress, BigDecimal.valueOf(100));
        }
        if ("CANCELLED".equals(nextStatus)) {
            wrapper.set(WorkTask::getActualEndTime, now);
        }

        boolean updated = update(wrapper);
        if (!updated) {
            return false;
        }

        if (existing.getParentId() != null) {
            cascadeToParent(existing.getParentId(), nextStatus);
        }
        if (existing.getProjectId() != null) {
            projectExecutionStateService.syncProjectStatus(existing.getProjectId(), "system");
        }
        return true;
    }

    @Override
    public List<WorkTask> listProjectTasks(Long projectId) {
        LambdaQueryWrapper<WorkTask> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkTask::getProjectId, projectId)
                .eq(WorkTask::getDeleted, "0")
                .orderByAsc(WorkTask::getSortOrder)
                .orderByAsc(WorkTask::getParentId)
                .orderByAsc(WorkTask::getWbsCode)
                .orderByAsc(WorkTask::getPlannedStartTime)
                .orderByAsc(WorkTask::getTaskId);
        return list(wrapper);
    }

    @Override
    @Audit(name = "删除项目任务", highRisk = true)
    public boolean removeProjectTasks(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LambdaUpdateWrapper<WorkTask> wrapper = new LambdaUpdateWrapper<>();
        wrapper.in(WorkTask::getTaskId, ids)
                .set(WorkTask::getDeleted, "1");
        return update(wrapper);
    }

    @Override
    public boolean batchUpdateTree(List<ProjectWbsTreeNodeDTO> nodes, String updateBy) {
        if (nodes == null || nodes.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (ProjectWbsTreeNodeDTO node : nodes) {
            if (node == null || node.getTaskId() == null) {
                continue;
            }
            LambdaUpdateWrapper<WorkTask> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(WorkTask::getTaskId, node.getTaskId())
                    .set(WorkTask::getParentId, node.getParentId())
                    .set(WorkTask::getSortOrder, node.getSortOrder())
                    .set(WorkTask::getUpdateBy, updateBy)
                    .set(WorkTask::getUpdateTime, now);
            update(wrapper);
        }
        return true;
    }

    private WorkTask requireTask(Long taskId) {
        WorkTask task = getOne(new LambdaQueryWrapper<WorkTask>()
                .eq(WorkTask::getTaskId, taskId)
                .eq(WorkTask::getDeleted, 0)
                .last("LIMIT 1"));
        if (task == null) {
            throw new ServiceException("任务不存在: " + taskId, ErrorCodeConstants.BAD_REQUEST);
        }
        return task;
    }

    private String normalizeStatus(String status) {
        if (!StringUtils.isNotEmpty(status)) {
            throw new ServiceException("任务状态不能为空", ErrorCodeConstants.BAD_REQUEST);
        }
        String normalized = status.trim().toUpperCase();
        if (!ALLOWED_STATUS.contains(normalized)) {
            throw new ServiceException("不支持的任务状态: " + status, ErrorCodeConstants.BAD_REQUEST);
        }
        return normalized;
    }

    private void validateTransition(WorkTask task, String nextStatus) {
        if (task.getParentId() != null && !"DONE".equals(nextStatus)) {
            WorkTask parent = getById(task.getParentId());
            if (parent != null && "DONE".equalsIgnoreCase(parent.getStatus())) {
                throw new ServiceException("父任务已完成，子任务不能回退到未完成状态", ErrorCodeConstants.CONCURRENT_MODIFICATION);
            }
        }
        if ("DONE".equals(nextStatus) && hasUnfinishedChildren(task.getTaskId())) {
            throw new ServiceException("存在未完成子任务，父任务不能直接完成", ErrorCodeConstants.CONCURRENT_MODIFICATION);
        }
    }

    private boolean hasUnfinishedChildren(Long parentTaskId) {
        return count(new LambdaQueryWrapper<WorkTask>()
                .eq(WorkTask::getParentId, parentTaskId)
                .eq(WorkTask::getDeleted, 0)
                .ne(WorkTask::getStatus, "DONE")) > 0;
    }

    private void cascadeToParent(Long parentTaskId, String childStatus) {
        if (parentTaskId == null) {
            return;
        }
        WorkTask parent = requireTask(parentTaskId);
        LocalDateTime now = LocalDateTime.now();

        if ("DONE".equals(childStatus)) {
            boolean allChildrenDone = count(new LambdaQueryWrapper<WorkTask>()
                    .eq(WorkTask::getParentId, parentTaskId)
                    .eq(WorkTask::getDeleted, 0)
                    .ne(WorkTask::getStatus, "DONE")) == 0;
            if (allChildrenDone && !"DONE".equals(parent.getStatus())) {
                update(new LambdaUpdateWrapper<WorkTask>()
                        .eq(WorkTask::getTaskId, parentTaskId)
                        .eq(WorkTask::getDeleted, 0)
                        .set(WorkTask::getStatus, "DONE")
                        .set(parent.getActualStartTime() == null, WorkTask::getActualStartTime, now)
                        .set(WorkTask::getActualEndTime, now)
                        .set(WorkTask::getProgress, BigDecimal.valueOf(100))
                        .set(WorkTask::getUpdateTime, now));
                if (parent.getParentId() != null) {
                    cascadeToParent(parent.getParentId(), "DONE");
                }
            }
            return;
        }

        if ("CANCELLED".equals(childStatus) && !"CANCELLED".equals(parent.getStatus())) {
            update(new LambdaUpdateWrapper<WorkTask>()
                    .eq(WorkTask::getTaskId, parentTaskId)
                    .eq(WorkTask::getDeleted, 0)
                    .set(WorkTask::getStatus, "CANCELLED")
                    .set(WorkTask::getActualEndTime, now)
                    .set(WorkTask::getUpdateTime, now));
            if (parent.getParentId() != null) {
                cascadeToParent(parent.getParentId(), "CANCELLED");
            }
        }
    }
}

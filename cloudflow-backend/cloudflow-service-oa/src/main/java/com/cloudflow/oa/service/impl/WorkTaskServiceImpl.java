package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.utils.StringUtils;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.mapper.WorkTaskMapper;
import com.cloudflow.oa.service.IWorkTaskService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 协作任务 Service 实现类
 */
@Service
public class WorkTaskServiceImpl extends ServiceImpl<WorkTaskMapper, WorkTask> implements IWorkTaskService {

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
    @Audit(name = "更新任务状态", diff = true, highRisk = true)
    public boolean updateStatus(Long taskId, String status) {
        WorkTask task = new WorkTask();
        task.setTaskId(taskId);
        task.setStatus(status);
        return updateById(task);
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
}

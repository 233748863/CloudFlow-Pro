package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.utils.StringUtils;
import com.cloudflow.workflow.domain.WorkTask;
import com.cloudflow.workflow.mapper.WorkTaskMapper;
import com.cloudflow.workflow.service.IWorkTaskService;
import org.springframework.stereotype.Service;
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
    public boolean updateStatus(Long taskId, String status) {
        WorkTask task = new WorkTask();
        task.setTaskId(taskId);
        task.setStatus(status);
        return updateById(task);
    }
}

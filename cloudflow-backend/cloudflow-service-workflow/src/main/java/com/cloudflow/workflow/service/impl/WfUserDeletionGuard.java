package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.security.UserDeletionGuard;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class WfUserDeletionGuard implements UserDeletionGuard {

    private final WfTaskMapper wfTaskMapper;
    private final WfProcessInstanceMapper wfProcessInstanceMapper;

    @Override
    public List<String> findBlockingReferences(Long userId) {
        List<String> result = new ArrayList<>();
        Long taskCount = wfTaskMapper.selectCount(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .in(WfTask::getStatus, List.of("TODO", "PENDING", "CLAIMED")));
        if (taskCount != null && taskCount > 0) {
            result.add("工作流待办任务 " + taskCount + " 条");
        }
        Long instanceCount = wfProcessInstanceMapper.selectCount(new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getStartUserId, userId)
                .eq(WfProcessInstance::getStatus, "RUNNING"));
        if (instanceCount != null && instanceCount > 0) {
            result.add("工作流运行中实例 " + instanceCount + " 条");
        }
        return result;
    }
}

package com.cloudflow.workflow.strategy.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import com.cloudflow.workflow.strategy.AssigneeResolutionException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class InitiatorSelectedAssignStrategy implements AssignUserStrategy {
    private final WfTaskCandidateMapper candidateMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        return resolveMultiple(node, instance).get(0);
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> selected = candidateMapper.selectList(new LambdaQueryWrapper<WfTaskCandidate>()
                        .eq(WfTaskCandidate::getTenantId, instance.getTenantId())
                        .eq(WfTaskCandidate::getInstanceId, instance.getInstanceId())
                        .eq(WfTaskCandidate::getNodeKey, node.getId())
                        .eq(WfTaskCandidate::getSource, "INITIATOR_SELECTED")
                        .isNull(WfTaskCandidate::getTaskId)
                        .orderByAsc(WfTaskCandidate::getCreateTime, WfTaskCandidate::getCandidateId))
                .stream().map(WfTaskCandidate::getUserId).distinct().toList();
        if (selected.isEmpty()) {
            throw new AssigneeResolutionException("节点[" + node.getTitle() + "]缺少发起人选定的审批人");
        }
        return selected;
    }

    @Override
    public boolean supports(String approverType) {
        return "INITIATOR_SELECTED".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        return "发起人自选";
    }
}

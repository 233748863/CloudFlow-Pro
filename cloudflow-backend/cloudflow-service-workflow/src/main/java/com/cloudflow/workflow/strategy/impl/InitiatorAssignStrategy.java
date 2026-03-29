package com.cloudflow.workflow.strategy.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 发起人审批人策略。
 * 用于“报修人确认”“发起人验收”这类需要回到提交人的模板节点。
 */
@Component
public class InitiatorAssignStrategy implements AssignUserStrategy {

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        return instance.getStartUserId();
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> result = new ArrayList<>();
        if (instance.getStartUserId() != null) {
            result.add(instance.getStartUserId());
        }
        return result;
    }

    @Override
    public boolean supports(String approverType) {
        return "INITIATOR".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        return "发起人";
    }
}

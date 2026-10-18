package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.strategy.impl.DeptManagerAssignStrategy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class SelfApprovalPolicy {
    private final DeptManagerAssignStrategy deptManagerStrategy;

    public Resolution resolve(Long assignee, WfNodeConfig node, WfProcessInstance instance) {
        if (assignee == null || !Objects.equals(assignee, instance.getStartUserId())) {
            return new Resolution(assignee, false, null);
        }
        String policy = node.getApproveSelf() == null ? "ALLOW" : node.getApproveSelf();
        if ("ALLOW".equals(policy)) {
            return new Resolution(assignee, false, null);
        }
        if ("AUTO_SKIP".equals(policy)) {
            return new Resolution(null, true, "审批人与发起人相同，按配置自动跳过");
        }
        if (!"TO_DIRECT_LEADER".equals(policy) && !"TO_DEPT_MANAGER".equals(policy)) {
            throw WorkflowException.validationError("未知自审策略: " + policy);
        }
        WfNodeConfig redirect = new WfNodeConfig();
        redirect.setApproverType("TO_DIRECT_LEADER".equals(policy) ? "DIRECT_LEADER" : "DEPT_MANAGER");
        Long redirected = deptManagerStrategy.resolve(redirect, instance);
        if (redirected == null) {
            throw WorkflowException.validationError("自审转派未找到负责人，请检查部门配置");
        }
        if (Objects.equals(redirected, instance.getStartUserId())) {
            return new Resolution(assignee, false, "APPROVE_SELF_REDIRECT_FAILED_DEGRADE_TO_ALLOW");
        }
        return new Resolution(redirected, false, null);
    }

    public record Resolution(Long assignee, boolean skipped, String note) {
    }
}

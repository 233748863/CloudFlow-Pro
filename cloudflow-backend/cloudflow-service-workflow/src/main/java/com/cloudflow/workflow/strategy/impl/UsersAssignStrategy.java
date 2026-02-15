package com.cloudflow.workflow.strategy.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.strategy.AssignUserStrategy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 指定多人策略 —— 逗号分隔的多个用户ID
 * approverType = "USERS" 或 "USER_LIST", approverValue = "1,2,3"
 *
 * 主要用于会签场景，直接指定多个审批人
 */
@Component
public class UsersAssignStrategy implements AssignUserStrategy {

    private static final Logger log = LoggerFactory.getLogger(UsersAssignStrategy.class);

    @Autowired
    private SysUserMapper sysUserMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> ids = resolveMultiple(node, instance);
        return ids.isEmpty() ? null : ids.get(0);
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        String value = node.getApproverValue();
        if (!StringUtils.hasText(value)) {
            return new ArrayList<>();
        }

        List<Long> userIds = new ArrayList<>();
        String[] parts = value.split(",");
        for (String part : parts) {
            try {
                userIds.add(Long.valueOf(part.trim()));
            } catch (NumberFormatException e) {
                log.warn("[UsersAssignStrategy] 无效的用户ID: {}", part);
            }
        }
        return userIds;
    }

    @Override
    public boolean supports(String approverType) {
        return "USERS".equals(approverType) || "USER_LIST".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        if (!StringUtils.hasText(approverValue)) {
            return "指定多人";
        }
        try {
            String[] ids = approverValue.split(",");
            List<Long> userIds = new ArrayList<>();
            for (String id : ids) {
                try { userIds.add(Long.valueOf(id.trim())); } catch (NumberFormatException ignored) {}
            }
            if (!userIds.isEmpty()) {
                List<SysUser> users = sysUserMapper.selectBatchIds(userIds);
                if (users != null && !users.isEmpty()) {
                    return users.stream()
                            .map(u -> u.getNickName() != null ? u.getNickName() : u.getUserName())
                            .collect(Collectors.joining(", "));
                }
            }
        } catch (Exception e) {
            log.warn("[UsersAssignStrategy] 查询用户失败: {}", e.getMessage());
        }
        return "指定多人";
    }
}

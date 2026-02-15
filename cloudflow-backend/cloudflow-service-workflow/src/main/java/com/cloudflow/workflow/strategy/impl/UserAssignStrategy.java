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

/**
 * 指定用户策略 —— 直接指定单个用户ID
 * approverType = "USER", approverValue = "用户ID"
 */
@Component
public class UserAssignStrategy implements AssignUserStrategy {

    private static final Logger log = LoggerFactory.getLogger(UserAssignStrategy.class);

    @Autowired
    private SysUserMapper sysUserMapper;

    @Override
    public Long resolve(WfNodeConfig node, WfProcessInstance instance) {
        String value = node.getApproverValue();
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            log.warn("[UserAssignStrategy] 无效的用户ID: {}", value);
            return null;
        }
    }

    @Override
    public List<Long> resolveMultiple(WfNodeConfig node, WfProcessInstance instance) {
        List<Long> list = new ArrayList<>();
        Long id = resolve(node, instance);
        if (id != null) {
            list.add(id);
        }
        return list;
    }

    @Override
    public boolean supports(String approverType) {
        return "USER".equals(approverType);
    }

    @Override
    public String getDescription(String approverType, String approverValue) {
        if (!StringUtils.hasText(approverValue)) {
            return "指定用户";
        }
        try {
            SysUser user = sysUserMapper.selectById(Long.valueOf(approverValue));
            if (user != null) {
                return user.getNickName() != null ? user.getNickName() : user.getUserName();
            }
        } catch (Exception e) {
            log.warn("[UserAssignStrategy] 查询用户失败: {}", e.getMessage());
        }
        return "指定用户";
    }
}

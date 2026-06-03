package com.cloudflow.workflow.handler.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysDept;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.mapper.system.SysDeptMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.ISysNoticeService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 通知节点处理器
 * 发送通知消息后自动继续流转
 *
 * @author CloudFlow
 */
@Component
@RequiredArgsConstructor
public class NotificationNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(NotificationNodeHandler.class);

    private final ISysNoticeService sysNoticeService;
    private final SysRoleMapper sysRoleMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final SysUserMapper sysUserMapper;
    private final SysDeptMapper sysDeptMapper;

    @Override
    public String getNodeType() {
        return "NOTIFICATION";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        try {
            log.info("[NotificationNodeHandler] 执行通知节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

            Map<String, Object> props = node.getProps();
            if (props == null) {
                log.warn("[NotificationNodeHandler] 通知节点未配置属性, nodeKey={}", node.getId());
                return true; // 自动继续
            }

            // 仅使用标准字段，避免旧字段双线维护
            String noticeTitle = (String) props.getOrDefault("notificationTitle", node.getTitle());
            String noticeContent = (String) props.getOrDefault("notificationContent", "流程通知");
            String noticeType = (String) props.getOrDefault("noticeType", "1");
            String recipientType = (String) props.getOrDefault("recipientType", "INITIATOR");

            // 变量替换
            if (variables != null) {
                for (Map.Entry<String, Object> entry : variables.entrySet()) {
                    String placeholder = "${" + entry.getKey() + "}";
                    if (noticeContent.contains(placeholder)) {
                        noticeContent = noticeContent.replace(placeholder, String.valueOf(entry.getValue()));
                    }
                }
            }

            // 确定接收人
            List<Long> recipientIds = resolveRecipients(recipientType, props, instance);

            // 发送通知
            for (Long recipientId : recipientIds) {
                sysNoticeService.sendNotice(recipientId, noticeTitle, noticeContent, noticeType,
                        UserContext.getUserId(), UserContext.getUserName());
            }

            log.info("[NotificationNodeHandler] 通知发送完成, nodeKey={}, recipients={}", node.getId(), recipientIds.size());
        } catch (Exception e) {
            log.error("[NotificationNodeHandler] 通知节点执行失败, nodeKey={}: {}", node.getId(), e.getMessage(), e);
            // 通知失败不中断流程
        }
        return true; // 自动继续流转
    }

    /**
     * 解析通知接收人
     */
    private List<Long> resolveRecipients(String recipientType, Map<String, Object> props, WfProcessInstance instance) {
        Set<Long> recipientIds = new LinkedHashSet<>();
        Long tenantId = instance.getTenantId();

        if ("INITIATOR".equals(recipientType)) {
            addActiveUser(recipientIds, tenantId, instance.getStartUserId());
        } else if ("ROLE".equals(recipientType)) {
            String roleKey = (String) props.get("recipientValue");
            if (StringUtils.hasText(roleKey)) {
                String normalizedRoleKey = roleKey.trim().toLowerCase(Locale.ROOT);
                SysRole role = sysRoleMapper.selectOne(
                        new LambdaQueryWrapper<SysRole>()
                                .eq(SysRole::getTenantId, tenantId)
                                .eq(SysRole::getRoleKey, normalizedRoleKey)
                                .eq(SysRole::getStatus, "0")
                                .eq(SysRole::getDeleted, 0));
                if (role != null) {
                    List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                            new LambdaQueryWrapper<SysUserRole>()
                                    .eq(SysUserRole::getTenantId, tenantId)
                                    .eq(SysUserRole::getRoleId, role.getRoleId()));
                    for (SysUserRole ur : userRoles) {
                        addActiveUser(recipientIds, tenantId, ur.getUserId());
                    }
                }
            }
        } else if ("USER".equals(recipientType)) {
            String userIdStr = (String) props.get("recipientValue");
            if (StringUtils.hasText(userIdStr)) {
                try {
                    addActiveUser(recipientIds, tenantId, Long.valueOf(userIdStr));
                } catch (NumberFormatException e) {
                    log.warn("[NotificationNodeHandler] 无效的用户ID: {}", userIdStr);
                }
            }
        } else if ("DEPT".equals(recipientType)) {
            String deptIdStr = (String) props.get("recipientValue");
            if (StringUtils.hasText(deptIdStr)) {
                try {
                    Long deptId = Long.valueOf(deptIdStr);
                    SysDept dept = sysDeptMapper.selectOne(new LambdaQueryWrapper<SysDept>()
                            .eq(SysDept::getTenantId, tenantId)
                            .eq(SysDept::getDeptId, deptId)
                            .eq(SysDept::getStatus, "0")
                            .eq(SysDept::getDeleted, 0));
                    if (dept != null) {
                        List<SysUser> users = sysUserMapper.selectList(activeUserQuery(tenantId)
                                .eq(SysUser::getDeptId, deptId));
                        for (SysUser user : users) {
                            recipientIds.add(user.getUserId());
                        }
                    }
                } catch (NumberFormatException e) {
                    log.warn("[NotificationNodeHandler] 无效的部门ID: {}", deptIdStr);
                }
            }
        } else if ("ALL".equals(recipientType)) {
            List<SysUser> users = sysUserMapper.selectList(activeUserQuery(tenantId));
            for (SysUser user : users) {
                recipientIds.add(user.getUserId());
            }
        }

        return new ArrayList<>(recipientIds);
    }

    private void addActiveUser(Set<Long> recipientIds, Long tenantId, Long userId) {
        if (userId == null) {
            return;
        }
        SysUser user = sysUserMapper.selectOne(activeUserQuery(tenantId)
                .eq(SysUser::getUserId, userId));
        if (user != null) {
            recipientIds.add(user.getUserId());
        }
    }

    private LambdaQueryWrapper<SysUser> activeUserQuery(Long tenantId) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getStatus, "0")
                .eq(SysUser::getDeleted, 0);
        if (tenantId != null) {
            wrapper.eq(SysUser::getTenantId, tenantId);
        }
        return wrapper;
    }
}

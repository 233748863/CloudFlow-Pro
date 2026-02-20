package com.cloudflow.workflow.handler.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.ISysNoticeService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

            // 兼容前端两种字段名
            String noticeTitle = (String) props.getOrDefault("notificationTitle",
                    (String) props.getOrDefault("noticeTitle", node.getTitle()));
            String noticeContent = (String) props.getOrDefault("notificationContent",
                    (String) props.getOrDefault("noticeContent", "流程通知"));
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
        List<Long> recipientIds = new ArrayList<>();

        if ("INITIATOR".equals(recipientType)) {
            recipientIds.add(instance.getStartUserId());
        } else if ("ROLE".equals(recipientType)) {
            String roleKey = (String) props.get("recipientValue");
            if (StringUtils.hasText(roleKey)) {
                SysRole role = sysRoleMapper.selectOne(
                        new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, roleKey));
                if (role != null) {
                    List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                            new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
                    for (SysUserRole ur : userRoles) {
                        recipientIds.add(ur.getUserId());
                    }
                }
            }
        } else if ("USER".equals(recipientType)) {
            String userIdStr = (String) props.get("recipientValue");
            if (StringUtils.hasText(userIdStr)) {
                try {
                    recipientIds.add(Long.valueOf(userIdStr));
                } catch (NumberFormatException e) {
                    log.warn("[NotificationNodeHandler] 无效的用户ID: {}", userIdStr);
                }
            }
        }

        return recipientIds;
    }
}

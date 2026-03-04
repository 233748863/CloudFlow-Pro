package com.cloudflow.workflow.handler.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.service.IProcessCopyService;
import com.cloudflow.workflow.strategy.AssignUserStrategyFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 抄送节点处理器
 * 借鉴 poco-flow CopyServiceTask 设计
 * 支持用户ID列表、角色、部门三种维度的抄送人解析
 *
 * @author CloudFlow
 */
@Component
@RequiredArgsConstructor
public class CopyNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(CopyNodeHandler.class);

    private final IProcessCopyService processCopyService;
    private final SysRoleMapper sysRoleMapper;
    private final SysUserRoleMapper sysUserRoleMapper;
    private final SysUserMapper sysUserMapper;
    private final AssignUserStrategyFactory assignUserStrategyFactory;
    private final ObjectMapper objectMapper;

    @Override
    public String getNodeType() {
        return "COPY";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        try {
            log.info("[CopyNodeHandler] 执行抄送节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

            Map<String, Object> props = node.getProps();
            if (props == null) {
                log.warn("[CopyNodeHandler] 抄送节点未配置属性, nodeKey={}", node.getId());
                return true;
            }

            // 收集抄送人ID列表（去重，先走标准 approverType/approverValue，再兼容旧 props）
            java.util.Set<Long> copyUserIdSet = new java.util.LinkedHashSet<>();

            // 0. 标准字段（与前端 WorkflowBuilder 对齐）
            if (StringUtils.hasText(node.getApproverType())) {
                List<Long> resolved = assignUserStrategyFactory.resolveMultiple(node, instance);
                if (resolved != null) {
                    copyUserIdSet.addAll(resolved);
                }
            }

            // 1. 直接指定的用户ID列表
            Object userIdsObj = props.get("copyUserIds");
            if (userIdsObj instanceof String && StringUtils.hasText((String) userIdsObj)) {
                for (String idStr : ((String) userIdsObj).split(",")) {
                    try { copyUserIdSet.add(Long.valueOf(idStr.trim())); } catch (NumberFormatException ignored) {}
                }
            } else if (userIdsObj instanceof List) {
                for (Object id : (List<?>) userIdsObj) {
                    try { copyUserIdSet.add(Long.valueOf(String.valueOf(id))); } catch (NumberFormatException ignored) {}
                }
            }

            // 2. 按角色抄送
            String copyRoleKey = (String) props.get("copyRoleKey");
            if (StringUtils.hasText(copyRoleKey)) {
                SysRole role = sysRoleMapper.selectOne(
                        new LambdaQueryWrapper<SysRole>().eq(SysRole::getRoleKey, copyRoleKey));
                if (role != null) {
                    List<SysUserRole> userRoles = sysUserRoleMapper.selectList(
                            new LambdaQueryWrapper<SysUserRole>().eq(SysUserRole::getRoleId, role.getRoleId()));
                    for (SysUserRole ur : userRoles) {
                        copyUserIdSet.add(ur.getUserId());
                    }
                }
            }

            // 3. 按部门抄送
            String copyDeptId = (String) props.get("copyDeptId");
            if (StringUtils.hasText(copyDeptId)) {
                List<SysUser> deptUsers = sysUserMapper.selectList(
                        new LambdaQueryWrapper<SysUser>().eq(SysUser::getDeptId, Long.valueOf(copyDeptId)));
                if (deptUsers != null) {
                    for (SysUser u : deptUsers) {
                        copyUserIdSet.add(u.getUserId());
                    }
                }
            }

            List<Long> copyUserIds = new ArrayList<>(copyUserIdSet);
            if (copyUserIds.isEmpty()) {
                log.info("[CopyNodeHandler] 未解析到抄送人, nodeKey={}, approverType={}, approverValue={}",
                        node.getId(), node.getApproverType(), node.getApproverValue());
                return true;
            }

            // 序列化表单数据快照
            String formData = null;
            if (variables != null && !variables.isEmpty()) {
                try {
                    formData = objectMapper.writeValueAsString(variables);
                } catch (Exception e) {
                    log.warn("[CopyNodeHandler] 序列化表单数据失败: {}", e.getMessage());
                }
            }

            // 创建抄送记录
            processCopyService.createCopyRecords(
                    instance.getInstanceId(),
                    instance.getProcessDefKey(),
                    instance.getTitle(),
                    node.getId(),
                    node.getTitle(),
                    instance.getStartUserId(),
                    instance.getStartUserName(),
                    copyUserIds,
                    formData
            );

            log.info("[CopyNodeHandler] 抄送完成, nodeKey={}, 抄送人数={}", node.getId(), copyUserIds.size());
        } catch (Exception e) {
            log.error("[CopyNodeHandler] 抄送节点执行失败, nodeKey={}: {}", node.getId(), e.getMessage(), e);
            // 抄送失败不中断流程
        }
        return true; // 自动继续流转
    }
}

package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.VersionDTO;
import com.cloudflow.workflow.domain.dto.VersionDetailDTO;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.INotificationService;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.util.VersionNumberGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 流程版本服务实现类
 *
 * C6 版本体系统一：唯一版本事实源为 wf_process_definition 多版本行
 * （每个版本一行，version 整数递增，语义化版本号/变更说明/校验和等元数据存于行内新列）。
 * 原 wf_template_version 独立版本表与 wf_process_version_snapshot 发布快照表已下线，
 * 本服务的查询/回滚全部基于 definition 版本行实现，对外 DTO 结构保持不变（前端零改动）。
 *
 * @author CloudFlow
 */
@Slf4j
@Service
public class VersionServiceImpl implements IVersionService {

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WfProcessInstanceMapper instanceMapper;

    @Autowired
    private INotificationService notificationService;

    @Autowired
    private SysUserMapper sysUserMapper;

    /**
     * 为指定版本行填充版本元数据（语义化版本号、变更类型、变更说明、校验和）。
     * 保存链路在 definition 行落库后调用，与保存同事务；失败抛异常整体回滚。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowVersion createVersion(String workflowId, String definition, String changeLog, String createdBy) {
        log.info("填充流程版本元数据, definitionId={}, createdBy={}", workflowId, createdBy);
        WfProcessDefinition row = requireWorkflowAndTenantAccess(workflowId, "创建流程版本");

        // 上一版本 = 同 key 下 version 小于本行的最新行
        WfProcessDefinition previous = findPreviousVersionRow(row);

        String newVersionNumber;
        VersionNumberGenerator.ChangeType changeType;
        if (previous == null || !StringUtils.hasText(previous.getModelJson())) {
            newVersionNumber = "1.0.0";
            changeType = VersionNumberGenerator.ChangeType.MAJOR;
        } else {
            changeType = VersionNumberGenerator.detectChangeType(previous.getModelJson(), definition);
            String baseNumber = StringUtils.hasText(previous.getCurrentVersion())
                    ? previous.getCurrentVersion() : "1.0.0";
            newVersionNumber = VersionNumberGenerator.generateNextVersion(baseNumber, changeType);
        }

        row.setCurrentVersion(newVersionNumber);
        row.setChangeLog(changeLog != null ? changeLog : "自动保存");
        row.setChangeType(changeType.getValue());
        row.setChecksum(calculateChecksum(definition));
        row.setUpdateTime(LocalDateTime.now());
        if (StringUtils.hasText(createdBy)) {
            row.setUpdateBy(createdBy);
        }
        int updated = definitionMapper.updateById(row);
        if (updated <= 0) {
            throw new WorkflowException("填充版本元数据失败, definitionId=" + workflowId);
        }

        log.info("版本元数据已填充, definitionId={}, versionNumber={}", workflowId, newVersionNumber);
        return toVersionVO(row);
    }

    /**
     * 获取流程的版本历史列表：同 processKey 的全部版本行，按整数版本倒序
     */
    @Override
    public List<VersionDTO> getVersionHistory(String workflowId) {
        log.info("查询流程版本历史, definitionId={}", workflowId);
        WfProcessDefinition row = requireWorkflowAndTenantAccess(workflowId, "查询流程版本历史");

        List<WfProcessDefinition> rows = listVersionRowsByKey(row.getProcessKey(), row.getTenantId());

        Map<String, String> creatorNameMap = resolveUserNameMap(rows.stream()
            .map(r -> StringUtils.hasText(r.getUpdateBy()) ? r.getUpdateBy() : r.getCreateBy())
            .collect(Collectors.toList()));

        List<VersionDTO> dtoList = rows.stream()
            .map(r -> convertToDTO(toVersionVO(r), creatorNameMap))
            .collect(Collectors.toList());

        log.info("查询到 {} 个版本记录", dtoList.size());
        return dtoList;
    }

    /**
     * 获取特定版本的详细信息（versionId = 版本行 definitionId）
     */
    @Override
    public VersionDetailDTO getVersionDetail(String versionId) {
        log.info("查询版本详情, definitionId={}", versionId);
        WfProcessDefinition row = requireWorkflowAndTenantAccess(versionId, "查询版本详情");
        WorkflowVersion vo = toVersionVO(row);
        return convertToDetailDTO(vo, resolveUserName(vo.getCreatedBy()));
    }

    /**
     * 获取流程的最新版本（同 processKey 下 version 最大的行）
     */
    @Override
    public WorkflowVersion getLatestVersion(String workflowId) {
        WfProcessDefinition row = requireWorkflowAndTenantAccess(workflowId, "查询最新版本");
        WfProcessDefinition latest = definitionMapper.selectPage(new Page<>(1, 1, false),
                versionRowsQuery(row.getProcessKey(), row.getTenantId()))
                .getRecords().stream().findFirst().orElse(null);
        return latest != null ? toVersionVO(latest) : null;
    }

    /**
     * 根据语义化版本号获取版本
     */
    @Override
    public WorkflowVersion getVersionByNumber(String workflowId, String versionNumber) {
        WfProcessDefinition row = requireWorkflowAndTenantAccess(workflowId, "按版本号查询版本");
        WfProcessDefinition matched = definitionMapper.selectPage(new Page<>(1, 1, false),
                versionRowsQuery(row.getProcessKey(), row.getTenantId())
                        .eq(WfProcessDefinition::getCurrentVersion, versionNumber))
                .getRecords().stream().findFirst().orElse(null);
        return matched != null ? toVersionVO(matched) : null;
    }

    /**
     * 回滚到指定版本：基于目标版本行内容生成新的 PUBLISHED 版本行（不原地改写、不绕过发布状态机），
     * 同 key 旧在线版本归档、is_latest 指针切换。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowVersion rollbackToVersion(String workflowId, String targetVersionId, String reason,
                                            Boolean forceRollback, String operatorId) {
        log.info("开始回滚流程版本, definitionId={}, targetDefinitionId={}, operatorId={}",
            workflowId, targetVersionId, operatorId);
        WfProcessDefinition current = requireWorkflowAndTenantAccess(workflowId, "回滚流程版本");

        WfProcessDefinition target = definitionMapper.selectById(targetVersionId);
        if (target == null) {
            throw new WorkflowException("目标版本不存在: " + targetVersionId);
        }
        if (!Objects.equals(current.getProcessKey(), target.getProcessKey())) {
            throw new WorkflowException("版本不属于该流程");
        }
        if (targetVersionId.equals(workflowId)) {
            throw new WorkflowException("目标版本与当前版本相同，无需回滚");
        }
        if (!StringUtils.hasText(target.getModelJson())) {
            throw new WorkflowException("目标版本缺少流程模型，无法回滚");
        }

        if (!Boolean.TRUE.equals(forceRollback) && hasRunningInstances(workflowId)) {
            throw new WorkflowException("该流程有正在运行的实例，请先处理或使用强制回滚");
        }

        // 当前最新版本行（版本号基准）
        WfProcessDefinition latest = definitionMapper.selectPage(new Page<>(1, 1, false),
                versionRowsQuery(current.getProcessKey(), current.getTenantId()))
                .getRecords().stream().findFirst().orElse(null);
        if (latest == null) {
            throw new WorkflowException("流程没有当前版本");
        }

        String baseNumber = StringUtils.hasText(latest.getCurrentVersion()) ? latest.getCurrentVersion() : "1.0.0";
        String newVersionNumber = VersionNumberGenerator.generateNextVersion(
                baseNumber, VersionNumberGenerator.ChangeType.MAJOR);
        LocalDateTime now = LocalDateTime.now();

        // 旧 is_latest 指针清零
        latest.setIsLatest(0);
        definitionMapper.updateById(latest);

        // 同 key 在线版本归档（保持"同 key 唯一 PUBLISHED"约束）
        definitionMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, current.getProcessKey())
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .eq(current.getTenantId() != null, WfProcessDefinition::getTenantId, current.getTenantId())
                .set(WfProcessDefinition::getStatus, "ARCHIVED"));

        // 基于目标版本行生成新版本行
        WfProcessDefinition rollbackRow = new WfProcessDefinition();
        BeanUtils.copyProperties(target, rollbackRow);
        rollbackRow.setDefinitionId(UUID.randomUUID().toString());
        rollbackRow.setVersion((latest.getVersion() != null ? latest.getVersion() : 0) + 1);
        rollbackRow.setVersionLock(0);
        rollbackRow.setIsLatest(1);
        rollbackRow.setStatus("PUBLISHED");
        rollbackRow.setCurrentVersion(newVersionNumber);
        rollbackRow.setChangeLog("回滚自版本 " + target.getCurrentVersion()
                + (reason != null ? "，原因：" + reason : ""));
        rollbackRow.setChangeType(VersionNumberGenerator.ChangeType.MAJOR.getValue());
        rollbackRow.setChecksum(calculateChecksum(target.getModelJson()));
        rollbackRow.setIsRollback(1);
        rollbackRow.setRollbackFromVersion(target.getCurrentVersion());
        rollbackRow.setCreateTime(now);
        rollbackRow.setUpdateTime(now);
        if (StringUtils.hasText(operatorId)) {
            rollbackRow.setCreateBy(operatorId);
            rollbackRow.setUpdateBy(operatorId);
        }
        definitionMapper.insert(rollbackRow);

        log.info("版本回滚成功, 新版本行={}, 版本号={}, 回滚自={}",
                rollbackRow.getDefinitionId(), newVersionNumber, target.getCurrentVersion());

        // 发送回滚通知
        sendRollbackNotice(current, latest, target, reason);

        return toVersionVO(rollbackRow);
    }

    /**
     * 检查流程是否有正在运行的实例（按 processKey 覆盖同流程全部版本）
     */
    @Override
    public boolean hasRunningInstances(String workflowId) {
        WfProcessDefinition row = requireWorkflowAndTenantAccess(workflowId, "查询运行中实例");
        LambdaQueryWrapper<WfProcessInstance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessInstance::getProcessDefKey, row.getProcessKey())
               .in(WfProcessInstance::getStatus, "RUNNING", "SUSPENDED");
        if (row.getTenantId() != null) {
            wrapper.eq(WfProcessInstance::getTenantId, row.getTenantId());
        }

        Long count = instanceMapper.selectCount(wrapper);
        boolean hasRunning = count != null && count > 0;
        if (hasRunning) {
            log.warn("流程有 {} 个正在运行的实例, processKey={}", count, row.getProcessKey());
        }
        return hasRunning;
    }

    // ==================== 内部工具 ====================

    /** 同 key 版本行查询（version 倒序） */
    private LambdaQueryWrapper<WfProcessDefinition> versionRowsQuery(String processKey, Long tenantId) {
        LambdaQueryWrapper<WfProcessDefinition> wrapper = new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, processKey)
                .orderByDesc(WfProcessDefinition::getVersion);
        if (tenantId != null) {
            wrapper.eq(WfProcessDefinition::getTenantId, tenantId);
        }
        return wrapper;
    }

    private List<WfProcessDefinition> listVersionRowsByKey(String processKey, Long tenantId) {
        return definitionMapper.selectList(versionRowsQuery(processKey, tenantId));
    }

    /** 上一版本行：同 key 下 version 小于指定行的最新行 */
    private WfProcessDefinition findPreviousVersionRow(WfProcessDefinition row) {
        if (row.getVersion() == null) {
            return null;
        }
        LambdaQueryWrapper<WfProcessDefinition> wrapper = versionRowsQuery(row.getProcessKey(), row.getTenantId())
                .lt(WfProcessDefinition::getVersion, row.getVersion());
        return definitionMapper.selectPage(new Page<>(1, 1, false), wrapper)
                .getRecords().stream().findFirst().orElse(null);
    }

    /** definition 版本行 → 版本 VO（保持既有 API 字段结构） */
    private WorkflowVersion toVersionVO(WfProcessDefinition row) {
        WorkflowVersion vo = new WorkflowVersion();
        vo.setId(row.getDefinitionId());
        vo.setWorkflowId(row.getDefinitionId());
        vo.setVersionNumber(StringUtils.hasText(row.getCurrentVersion()) ? row.getCurrentVersion() : "1.0.0");
        vo.setDefinition(row.getModelJson());
        vo.setChangeLog(row.getChangeLog());
        vo.setChangeType(row.getChangeType());
        vo.setCreatedBy(StringUtils.hasText(row.getUpdateBy()) ? row.getUpdateBy() : row.getCreateBy());
        vo.setCreatedAt(row.getUpdateTime() != null ? row.getUpdateTime() : row.getCreateTime());
        vo.setIsRollback(row.getIsRollback() != null ? row.getIsRollback() : 0);
        vo.setRollbackFromVersion(row.getRollbackFromVersion());
        vo.setChecksum(row.getChecksum());
        vo.setTenantId(row.getTenantId());
        return vo;
    }

    private void sendRollbackNotice(WfProcessDefinition current, WfProcessDefinition latest,
                                    WfProcessDefinition target, String reason) {
        try {
            if (current.getCreateBy() == null || current.getCreateBy().isEmpty()) {
                return;
            }
            Long createById;
            try {
                createById = Long.parseLong(current.getCreateBy());
            } catch (NumberFormatException e) {
                log.warn("无法解析创建者ID: {}", current.getCreateBy());
                return;
            }
            String operatorName = StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "管理员";
            notificationService.sendRollbackNotification(
                createById,
                current.getDefinitionId(),
                current.getProcessName(),
                latest.getCurrentVersion(),
                target.getCurrentVersion(),
                reason != null ? reason : "版本回滚",
                operatorName
            );
        } catch (Exception e) {
            log.warn("发送回滚通知失败: {}", e.getMessage());
        }
    }

    /**
     * 计算流程定义的校验和（使用 SHA-256）
     */
    private String calculateChecksum(String definition) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(definition.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            log.error("计算校验和失败", e);
            return "";
        }
    }

    private VersionDTO convertToDTO(WorkflowVersion version, Map<String, String> userNameMap) {
        VersionDTO dto = new VersionDTO();
        BeanUtils.copyProperties(version, dto);
        dto.setIsRollback(version.getIsRollback() != null && version.getIsRollback() == 1);
        dto.setCreatedByName(resolveUserDisplayName(version.getCreatedBy(), userNameMap));
        return dto;
    }

    private VersionDetailDTO convertToDetailDTO(WorkflowVersion version, String createdByName) {
        VersionDetailDTO dto = new VersionDetailDTO();
        BeanUtils.copyProperties(version, dto);
        dto.setIsRollback(version.getIsRollback() != null && version.getIsRollback() == 1);
        try {
            Object definitionObj = objectMapper.readValue(version.getDefinition(), Object.class);
            dto.setDefinition(definitionObj);
        } catch (Exception e) {
            log.error("解析流程定义失败", e);
            dto.setDefinition(version.getDefinition());
        }
        dto.setCreatedByName(createdByName);
        return dto;
    }

    private WfProcessDefinition requireWorkflowAndTenantAccess(String workflowId, String operation) {
        WfProcessDefinition definition = definitionMapper.selectById(workflowId);
        if (definition == null) {
            throw WorkflowException.processNotFound(workflowId);
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, definition.getTenantId())) {
            throw WorkflowException.permissionDenied(operation);
        }
        return definition;
    }

    private Map<String, String> resolveUserNameMap(List<String> rawUserIds) {
        Map<String, String> result = new HashMap<>();
        List<Long> userIds = rawUserIds.stream()
            .filter(StringUtils::hasText)
            .map(this::parseUserId)
            .filter(Objects::nonNull)
            .distinct()
            .collect(Collectors.toList());
        if (userIds.isEmpty()) {
            return result;
        }

        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
            .in(SysUser::getUserId, userIds);
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            wrapper.eq(SysUser::getTenantId, currentTenantId);
        }

        for (SysUser user : sysUserMapper.selectList(wrapper)) {
            result.put(String.valueOf(user.getUserId()), displayNameOf(user));
        }
        return result;
    }

    private String resolveUserName(String rawUserId) {
        if (!StringUtils.hasText(rawUserId)) {
            return rawUserId;
        }
        Long userId = parseUserId(rawUserId);
        if (userId == null) {
            return rawUserId;
        }
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
            .eq(SysUser::getUserId, userId);
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            wrapper.eq(SysUser::getTenantId, currentTenantId);
        }
        SysUser user = sysUserMapper.selectOne(wrapper);
        return user != null ? displayNameOf(user) : rawUserId;
    }

    private String resolveUserDisplayName(String rawUserId, Map<String, String> userNameMap) {
        if (!StringUtils.hasText(rawUserId)) {
            return rawUserId;
        }
        return userNameMap.getOrDefault(rawUserId, rawUserId);
    }

    private Long parseUserId(String rawUserId) {
        try {
            return StringUtils.hasText(rawUserId) ? Long.valueOf(rawUserId) : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String displayNameOf(SysUser user) {
        if (user == null) {
            return null;
        }
        if (StringUtils.hasText(user.getNickName())) {
            return user.getNickName();
        }
        if (StringUtils.hasText(user.getUserName())) {
            return user.getUserName();
        }
        return String.valueOf(user.getUserId());
    }
}

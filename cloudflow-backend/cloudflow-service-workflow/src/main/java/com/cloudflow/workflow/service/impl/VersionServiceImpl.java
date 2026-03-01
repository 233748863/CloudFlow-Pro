package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WorkflowVersion;
import com.cloudflow.workflow.domain.dto.VersionDTO;
import com.cloudflow.workflow.domain.dto.VersionDetailDTO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WorkflowVersionMapper;
import com.cloudflow.workflow.service.IVersionService;
import com.cloudflow.workflow.util.VersionNumberGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 流程版本服务实现类
 * 实现版本的自动创建、查询和管理功能
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class VersionServiceImpl implements IVersionService {

    @Autowired
    private WorkflowVersionMapper versionMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WfProcessInstanceMapper instanceMapper;

    /**
     * 创建新版本
     * 自动检测变更类型并生成版本号
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowVersion createVersion(String workflowId, String definition, String changeLog, String createdBy) {
        log.info("开始创建流程版本, workflowId={}, createdBy={}", workflowId, createdBy);

        try {
            // 获取最新版本
            WorkflowVersion latestVersion = getLatestVersion(workflowId);

            // 确定变更类型和新版本号
            String newVersionNumber;
            VersionNumberGenerator.ChangeType changeType;

            if (latestVersion == null) {
                // 首次创建版本，使用 1.0.0
                newVersionNumber = "1.0.0";
                changeType = VersionNumberGenerator.ChangeType.MAJOR;
                log.info("首次创建版本，版本号: {}", newVersionNumber);
            } else {
                // 检测变更类型
                changeType = VersionNumberGenerator.detectChangeType(
                    latestVersion.getDefinition(), 
                    definition
                );
                
                // 生成新版本号
                newVersionNumber = VersionNumberGenerator.generateNextVersion(
                    latestVersion.getVersionNumber(), 
                    changeType
                );
                
                log.info("检测到变更类型: {}, 新版本号: {}", changeType, newVersionNumber);
            }

            // 计算定义的校验和
            String checksum = calculateChecksum(definition);

            // 创建版本记录
            WorkflowVersion version = new WorkflowVersion();
            version.setId(UUID.randomUUID().toString().replace("-", ""));
            version.setWorkflowId(workflowId);
            version.setVersionNumber(newVersionNumber);
            version.setDefinition(definition);
            version.setChangeLog(changeLog != null ? changeLog : "自动保存");
            version.setChangeType(changeType.getValue());
            version.setCreatedBy(createdBy);
            version.setCreatedAt(LocalDateTime.now());
            version.setIsRollback(0);
            version.setChecksum(checksum);

            // 保存到数据库
            versionMapper.insert(version);

            log.info("版本创建成功, versionId={}, versionNumber={}", version.getId(), newVersionNumber);
            return version;

        } catch (Exception e) {
            log.error("创建版本失败, workflowId={}", workflowId, e);
            throw new WorkflowException("创建版本失败: " + e.getMessage());
        }
    }

    /**
     * 获取流程的版本历史列表
     * 按创建时间倒序排列
     */
    @Override
    public List<VersionDTO> getVersionHistory(String workflowId) {
        log.info("查询流程版本历史, workflowId={}", workflowId);

        LambdaQueryWrapper<WorkflowVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkflowVersion::getWorkflowId, workflowId)
               .orderByDesc(WorkflowVersion::getCreatedAt);

        List<WorkflowVersion> versions = versionMapper.selectList(wrapper);

        // 转换为 DTO
        List<VersionDTO> dtoList = versions.stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());

        log.info("查询到 {} 个版本记录", dtoList.size());
        return dtoList;
    }

    /**
     * 获取特定版本的详细信息
     */
    @Override
    public VersionDetailDTO getVersionDetail(String versionId) {
        log.info("查询版本详情, versionId={}", versionId);

        WorkflowVersion version = versionMapper.selectById(versionId);
        if (version == null) {
            throw new WorkflowException("版本不存在: " + versionId);
        }

        return convertToDetailDTO(version);
    }

    /**
     * 获取流程的最新版本
     */
    @Override
    public WorkflowVersion getLatestVersion(String workflowId) {
        LambdaQueryWrapper<WorkflowVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkflowVersion::getWorkflowId, workflowId)
               .orderByDesc(WorkflowVersion::getCreatedAt)
               .last("LIMIT 1");

        return versionMapper.selectOne(wrapper);
    }

    /**
     * 根据版本号获取版本
     */
    @Override
    public WorkflowVersion getVersionByNumber(String workflowId, String versionNumber) {
        LambdaQueryWrapper<WorkflowVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WorkflowVersion::getWorkflowId, workflowId)
               .eq(WorkflowVersion::getVersionNumber, versionNumber);

        return versionMapper.selectOne(wrapper);
    }

    /**
     * 计算流程定义的校验和（使用 SHA-256）
     * 用于验证数据完整性
     */
    private String calculateChecksum(String definition) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(definition.getBytes(StandardCharsets.UTF_8));
            
            // 转换为十六进制字符串
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

    /**
     * 转换为 VersionDTO
     */
    private VersionDTO convertToDTO(WorkflowVersion version) {
        VersionDTO dto = new VersionDTO();
        BeanUtils.copyProperties(version, dto);
        dto.setIsRollback(version.getIsRollback() == 1);
        // TODO: 查询创建者名称
        dto.setCreatedByName(version.getCreatedBy());
        return dto;
    }

    /**
     * 转换为 VersionDetailDTO
     */
    private VersionDetailDTO convertToDetailDTO(WorkflowVersion version) {
        VersionDetailDTO dto = new VersionDetailDTO();
        BeanUtils.copyProperties(version, dto);
        dto.setIsRollback(version.getIsRollback() == 1);
        
        // 将 JSON 字符串转换为对象
        try {
            Object definitionObj = objectMapper.readValue(version.getDefinition(), Object.class);
            dto.setDefinition(definitionObj);
        } catch (Exception e) {
            log.error("解析流程定义失败", e);
            dto.setDefinition(version.getDefinition());
        }
        
        // TODO: 查询创建者名称
        dto.setCreatedByName(version.getCreatedBy());
        return dto;
    }

    /**
     * 回滚到指定版本
     * 恢复指定版本的流程定义，并创建新的回滚版本记录
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowVersion rollbackToVersion(String workflowId, String targetVersionId, String reason, 
                                            Boolean forceRollback, String operatorId) {
        log.info("开始回滚流程版本, workflowId={}, targetVersionId={}, operatorId={}", 
            workflowId, targetVersionId, operatorId);

        // 查询目标版本
        WorkflowVersion targetVersion = versionMapper.selectById(targetVersionId);
        if (targetVersion == null) {
            throw new WorkflowException("目标版本不存在: " + targetVersionId);
        }

        // 验证版本是否属于该流程
        if (!workflowId.equals(targetVersion.getWorkflowId())) {
            throw new WorkflowException("版本不属于该流程");
        }

        // 检查是否有正在运行的实例
        if (!Boolean.TRUE.equals(forceRollback) && hasRunningInstances(workflowId)) {
            throw new WorkflowException("该流程有正在运行的实例，请先处理或使用强制回滚");
        }

        // 获取当前最新版本
        WorkflowVersion currentVersion = getLatestVersion(workflowId);
        if (currentVersion == null) {
            throw new WorkflowException("流程没有当前版本");
        }

        // 检查是否回滚到相同版本
        if (targetVersionId.equals(currentVersion.getId())) {
            throw new WorkflowException("目标版本与当前版本相同，无需回滚");
        }

        try {
            // 更新流程定义
            WfProcessDefinition definition = definitionMapper.selectById(workflowId);
            if (definition != null) {
                definition.setModelJson(targetVersion.getDefinition());
                definitionMapper.updateById(definition);
                log.info("流程定义已更新为目标版本");
            }

            // 创建回滚版本记录
            String newVersionNumber = VersionNumberGenerator.generateNextVersion(
                currentVersion.getVersionNumber(), 
                VersionNumberGenerator.ChangeType.MAJOR  // 回滚视为重大变更
            );

            String checksum = calculateChecksum(targetVersion.getDefinition());

            WorkflowVersion rollbackVersion = new WorkflowVersion();
            rollbackVersion.setId(UUID.randomUUID().toString().replace("-", ""));
            rollbackVersion.setWorkflowId(workflowId);
            rollbackVersion.setVersionNumber(newVersionNumber);
            rollbackVersion.setDefinition(targetVersion.getDefinition());
            rollbackVersion.setChangeLog("回滚自版本 " + targetVersion.getVersionNumber() + 
                (reason != null ? "，原因：" + reason : ""));
            rollbackVersion.setChangeType(VersionNumberGenerator.ChangeType.MAJOR.getValue());
            rollbackVersion.setCreatedBy(operatorId);
            rollbackVersion.setCreatedAt(LocalDateTime.now());
            rollbackVersion.setIsRollback(1);
            rollbackVersion.setRollbackFromVersion(targetVersion.getVersionNumber());
            rollbackVersion.setChecksum(checksum);

            versionMapper.insert(rollbackVersion);

            log.info("版本回滚成功, 新版本号: {}, 回滚自版本: {}", 
                newVersionNumber, targetVersion.getVersionNumber());

            return rollbackVersion;

        } catch (Exception e) {
            log.error("版本回滚失败, workflowId={}, targetVersionId={}", workflowId, targetVersionId, e);
            throw new WorkflowException("版本回滚失败: " + e.getMessage());
        }
    }

    /**
     * 检查流程是否有正在运行的实例
     */
    @Override
    public boolean hasRunningInstances(String workflowId) {
        LambdaQueryWrapper<WfProcessInstance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessInstance::getDefinitionId, workflowId)
               .in(WfProcessInstance::getStatus, "RUNNING", "SUSPENDED");

        Long count = instanceMapper.selectCount(wrapper);
        boolean hasRunning = count != null && count > 0;

        if (hasRunning) {
            log.warn("流程有 {} 个正在运行的实例, workflowId={}", count, workflowId);
        }

        return hasRunning;
    }
}

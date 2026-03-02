package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfAuditLog;
import com.cloudflow.workflow.domain.dto.AuditLogDTO;
import com.cloudflow.workflow.enums.OperationType;
import com.cloudflow.workflow.enums.TargetType;
import com.cloudflow.workflow.mapper.WfAuditLogMapper;
import com.cloudflow.workflow.service.IAuditLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 审计日志服务实现
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
public class AuditLogServiceImpl implements IAuditLogService {

    @Autowired
    private WfAuditLogMapper auditLogMapper;

    /**
     * 记录审计日志（成功操作）
     * 使用异步方式记录，不影响主业务流程
     */
    @Async
    @Override
    public void log(OperationType operationType, TargetType targetType, 
                    String targetId, String targetName, String reason) {
        log(operationType, targetType, targetId, targetName, reason, null);
    }

    /**
     * 记录审计日志（成功操作，带详情）
     * 使用异步方式记录，不影响主业务流程
     */
    @Async
    @Override
    public void log(OperationType operationType, TargetType targetType, 
                    String targetId, String targetName, String reason, String details) {
        try {
            WfAuditLog auditLog = buildAuditLog(
                operationType, targetType, targetId, targetName, reason, details, "SUCCESS", null
            );
            auditLogMapper.insert(auditLog);
            log.debug("审计日志记录成功: operationType={}, targetId={}", operationType, targetId);
        } catch (Exception e) {
            // 审计日志记录失败不应该影响主业务，只记录错误日志
            log.error("审计日志记录失败: operationType={}, targetId={}", operationType, targetId, e);
        }
    }

    /**
     * 记录失败的审计日志
     * 使用异步方式记录，不影响主业务流程
     */
    @Async
    @Override
    public void logFailure(OperationType operationType, TargetType targetType, 
                          String targetId, String targetName, String reason, String errorMessage) {
        try {
            WfAuditLog auditLog = buildAuditLog(
                operationType, targetType, targetId, targetName, reason, null, "FAILED", errorMessage
            );
            auditLogMapper.insert(auditLog);
            log.debug("审计日志记录成功（失败操作）: operationType={}, targetId={}", operationType, targetId);
        } catch (Exception e) {
            log.error("审计日志记录失败: operationType={}, targetId={}", operationType, targetId, e);
        }
    }

    /**
     * 查询审计日志列表（分页）
     */
    @Override
    public Page<AuditLogDTO> listAuditLogs(String operationType, String targetType, 
                                          String operatorId, LocalDateTime startTime, 
                                          LocalDateTime endTime, int pageNum, int pageSize) {
        log.info("查询审计日志列表: operationType={}, targetType={}, operatorId={}, startTime={}, endTime={}, pageNum={}, pageSize={}",
            operationType, targetType, operatorId, startTime, endTime, pageNum, pageSize);

        // 构建查询条件
        LambdaQueryWrapper<WfAuditLog> queryWrapper = new LambdaQueryWrapper<>();
        
        if (StringUtils.hasText(operationType)) {
            queryWrapper.eq(WfAuditLog::getOperationType, operationType);
        }
        if (StringUtils.hasText(targetType)) {
            queryWrapper.eq(WfAuditLog::getTargetType, targetType);
        }
        if (StringUtils.hasText(operatorId)) {
            queryWrapper.eq(WfAuditLog::getOperatorId, operatorId);
        }
        if (startTime != null) {
            queryWrapper.ge(WfAuditLog::getOperationTime, startTime);
        }
        if (endTime != null) {
            queryWrapper.le(WfAuditLog::getOperationTime, endTime);
        }
        
        // 按操作时间倒序
        queryWrapper.orderByDesc(WfAuditLog::getOperationTime);

        // 分页查询
        Page<WfAuditLog> page = new Page<>(pageNum, pageSize);
        Page<WfAuditLog> auditLogPage = auditLogMapper.selectPage(page, queryWrapper);

        // 转换为 DTO
        Page<AuditLogDTO> resultPage = new Page<>(pageNum, pageSize);
        resultPage.setTotal(auditLogPage.getTotal());
        
        List<AuditLogDTO> dtoList = auditLogPage.getRecords().stream()
            .map(this::convertToDTO)
            .collect(Collectors.toList());
        
        resultPage.setRecords(dtoList);

        log.info("查询审计日志列表完成: total={}", resultPage.getTotal());
        return resultPage;
    }

    /**
     * 获取审计日志详情
     */
    @Override
    public AuditLogDTO getAuditLog(String id) {
        log.info("获取审计日志详情: id={}", id);
        
        WfAuditLog auditLog = auditLogMapper.selectById(id);
        if (auditLog == null) {
            log.warn("审计日志不存在: id={}", id);
            return null;
        }
        
        return convertToDTO(auditLog);
    }

    /**
     * 删除过期的审计日志
     */
    @Override
    public int deleteExpiredLogs(int daysToKeep) {
        log.info("删除过期的审计日志: daysToKeep={}", daysToKeep);
        
        LocalDateTime expireTime = LocalDateTime.now().minusDays(daysToKeep);
        
        LambdaQueryWrapper<WfAuditLog> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.lt(WfAuditLog::getOperationTime, expireTime);
        
        int count = auditLogMapper.delete(queryWrapper);
        
        log.info("删除过期审计日志完成: count={}", count);
        return count;
    }

    /**
     * 按目标对象删除历史审计日志
     */
    @Override
    public int deleteByTarget(TargetType targetType, String targetId) {
        if (targetType == null || !StringUtils.hasText(targetId)) {
            return 0;
        }

        LambdaQueryWrapper<WfAuditLog> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(WfAuditLog::getTargetType, targetType.name())
            .eq(WfAuditLog::getTargetId, targetId);

        int count = auditLogMapper.delete(queryWrapper);
        log.info("按目标删除审计日志完成: targetType={}, targetId={}, count={}",
            targetType, targetId, count);
        return count;
    }

    /**
     * 构建审计日志对象
     */
    private WfAuditLog buildAuditLog(OperationType operationType, TargetType targetType,
                                     String targetId, String targetName, String reason,
                                     String details, String result, String errorMessage) {
        // 获取当前用户信息
        Long userId = UserContext.getUserId();
        Long tenantId = UserContext.getTenantId();
        
        return WfAuditLog.builder()
            .id(UUID.randomUUID().toString().replace("-", ""))
            .operationType(operationType.name())
            .targetType(targetType.name())
            .targetId(targetId)
            .targetName(targetName)
            .operatorId(userId != null ? userId.toString() : "SYSTEM")
            .operatorName(userId != null ? userId.toString() : "SYSTEM") // TODO: 查询用户名称
            .operationTime(LocalDateTime.now())
            .operationReason(reason)
            .operationDetails(details)
            .operationResult(result)
            .errorMessage(errorMessage)
            .ipAddress(getClientIpAddress()) // TODO: 从请求中获取 IP
            .userAgent(getUserAgent()) // TODO: 从请求中获取 User-Agent
            .tenantId(tenantId)
            .build();
    }

    /**
     * 转换为 DTO
     */
    private AuditLogDTO convertToDTO(WfAuditLog auditLog) {
        return AuditLogDTO.builder()
            .id(auditLog.getId())
            .operationType(auditLog.getOperationType())
            .targetType(auditLog.getTargetType())
            .targetId(auditLog.getTargetId())
            .targetName(auditLog.getTargetName())
            .operatorId(auditLog.getOperatorId())
            .operatorName(auditLog.getOperatorName())
            .operationTime(auditLog.getOperationTime())
            .operationReason(auditLog.getOperationReason())
            .operationResult(auditLog.getOperationResult())
            .errorMessage(auditLog.getErrorMessage())
            .ipAddress(auditLog.getIpAddress())
            .build();
    }

    /**
     * 获取客户端 IP 地址
     * TODO: 从 HttpServletRequest 中获取
     */
    private String getClientIpAddress() {
        return "0.0.0.0";
    }

    /**
     * 获取用户代理
     * TODO: 从 HttpServletRequest 中获取
     */
    private String getUserAgent() {
        return "Unknown";
    }
}

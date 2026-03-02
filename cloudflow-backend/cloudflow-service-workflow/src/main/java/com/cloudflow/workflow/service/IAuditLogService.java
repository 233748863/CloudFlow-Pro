package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.dto.AuditLogDTO;
import com.cloudflow.workflow.enums.OperationType;
import com.cloudflow.workflow.enums.TargetType;

import java.time.LocalDateTime;

/**
 * 审计日志服务接口
 * 
 * @author CloudFlow
 */
public interface IAuditLogService {

    /**
     * 记录审计日志（成功操作）
     * 
     * @param operationType 操作类型
     * @param targetType 操作对象类型
     * @param targetId 操作对象 ID
     * @param targetName 操作对象名称
     * @param reason 操作原因
     */
    void log(OperationType operationType, TargetType targetType, 
             String targetId, String targetName, String reason);

    /**
     * 记录审计日志（成功操作，带详情）
     * 
     * @param operationType 操作类型
     * @param targetType 操作对象类型
     * @param targetId 操作对象 ID
     * @param targetName 操作对象名称
     * @param reason 操作原因
     * @param details 操作详情（JSON 格式）
     */
    void log(OperationType operationType, TargetType targetType, 
             String targetId, String targetName, String reason, String details);

    /**
     * 记录失败的审计日志
     * 
     * @param operationType 操作类型
     * @param targetType 操作对象类型
     * @param targetId 操作对象 ID
     * @param targetName 操作对象名称
     * @param reason 操作原因
     * @param errorMessage 错误信息
     */
    void logFailure(OperationType operationType, TargetType targetType, 
                    String targetId, String targetName, String reason, String errorMessage);

    /**
     * 查询审计日志列表（分页）
     * 
     * @param operationType 操作类型（可选）
     * @param targetType 操作对象类型（可选）
     * @param operatorId 操作人 ID（可选）
     * @param startTime 开始时间（可选）
     * @param endTime 结束时间（可选）
     * @param pageNum 页码
     * @param pageSize 每页大小
     * @return 审计日志分页列表
     */
    Page<AuditLogDTO> listAuditLogs(String operationType, String targetType, 
                                    String operatorId, LocalDateTime startTime, 
                                    LocalDateTime endTime, int pageNum, int pageSize);

    /**
     * 获取审计日志详情
     * 
     * @param id 审计日志 ID
     * @return 审计日志详情
     */
    AuditLogDTO getAuditLog(String id);

    /**
     * 删除过期的审计日志
     * 
     * @param daysToKeep 保留天数
     * @return 删除的记录数
     */
    int deleteExpiredLogs(int daysToKeep);

    /**
     * 按目标对象删除历史审计日志
     *
     * @param targetType 目标类型
     * @param targetId 目标对象 ID
     * @return 删除的记录数
     */
    int deleteByTarget(TargetType targetType, String targetId);
}

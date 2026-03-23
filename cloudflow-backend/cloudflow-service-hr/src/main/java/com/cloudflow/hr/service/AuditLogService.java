package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.AuditLogQueryDTO;
import com.cloudflow.hr.domain.entity.AuditLog;
import com.cloudflow.hr.domain.vo.AuditLogVO;

/**
 * 审计日志服务接口
 * 
 * @author CloudFlow
 */
public interface AuditLogService {
    
    /**
     * 记录操作日志
     * 
     * @param operationType 操作类型
     * @param businessModule 业务模块
     * @param businessType 业务类型
     * @param businessId 业务ID
     * @param businessNo 业务编号
     * @param operationDesc 操作描述
     * @param beforeData 变更前数据
     * @param afterData 变更后数据
     */
    void logOperation(String operationType, String businessModule, String businessType,
                     Long businessId, String businessNo, String operationDesc,
                     String beforeData, String afterData);
    
    /**
     * 记录操作日志（带变更内容）
     * 
     * @param operationType 操作类型
     * @param businessModule 业务模块
     * @param businessType 业务类型
     * @param businessId 业务ID
     * @param businessNo 业务编号
     * @param operationDesc 操作描述
     * @param beforeData 变更前数据
     * @param afterData 变更后数据
     * @param changeContent 变更内容
     */
    void logOperation(String operationType, String businessModule, String businessType,
                     Long businessId, String businessNo, String operationDesc,
                     String beforeData, String afterData, String changeContent);
    
    /**
     * 记录审批日志
     * 
     * @param businessModule 业务模块
     * @param businessType 业务类型
     * @param businessId 业务ID
     * @param businessNo 业务编号
     * @param approvalResult 审批结果
     * @param approvalComment 审批意见
     */
    void logApproval(String businessModule, String businessType,
                    Long businessId, String businessNo,
                    String approvalResult, String approvalComment);
    
    /**
     * 保存审计日志
     * 
     * @param auditLog 审计日志实体
     */
    void saveAuditLog(AuditLog auditLog);
    
    /**
     * 查询审计日志（分页）
     * 
     * @param queryDTO 查询条件
     * @return 分页结果
     */
    Page<AuditLogVO> queryAuditLogs(AuditLogQueryDTO queryDTO);
    
    /**
     * 根据ID查询审计日志详情
     * 
     * @param id 日志ID
     * @return 日志详情
     */
    AuditLogVO getAuditLogById(Long id);
    
    /**
     * 归档旧日志
     * 归档超过指定天数的日志
     * 
     * @param days 保留天数（归档此天数之前的日志）
     * @return 归档的日志数量
     */
    int archiveOldLogs(int days);
    
    /**
     * 删除已归档的旧日志
     * 删除已归档且超过指定天数的日志
     * 
     * @param days 保留天数（删除此天数之前的已归档日志）
     * @return 删除的日志数量
     */
    int deleteArchivedLogs(int days);
}

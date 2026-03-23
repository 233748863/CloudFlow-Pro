package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.AuditLogQueryDTO;
import com.cloudflow.hr.domain.entity.AuditLog;
import com.cloudflow.hr.domain.vo.AuditLogVO;
import com.cloudflow.hr.mapper.AuditLogMapper;
import com.cloudflow.hr.service.AuditLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 审计日志服务实现类
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogServiceImpl implements AuditLogService {
    
    private final AuditLogMapper auditLogMapper;
    
    // 日志类型映射
    private static final Map<String, String> LOG_TYPE_MAP = new HashMap<>();
    // 操作类型映射
    private static final Map<String, String> OPERATION_TYPE_MAP = new HashMap<>();
    // 业务模块映射
    private static final Map<String, String> BUSINESS_MODULE_MAP = new HashMap<>();
    // 状态映射
    private static final Map<String, String> STATUS_MAP = new HashMap<>();
    
    static {
        LOG_TYPE_MAP.put("OPERATION", "操作日志");
        LOG_TYPE_MAP.put("APPROVAL", "审批日志");
        
        OPERATION_TYPE_MAP.put("CREATE", "创建");
        OPERATION_TYPE_MAP.put("UPDATE", "修改");
        OPERATION_TYPE_MAP.put("DELETE", "删除");
        OPERATION_TYPE_MAP.put("APPROVE", "审批通过");
        OPERATION_TYPE_MAP.put("REJECT", "审批拒绝");
        
        BUSINESS_MODULE_MAP.put("EMPLOYEE", "员工管理");
        BUSINESS_MODULE_MAP.put("ATTENDANCE", "考勤管理");
        BUSINESS_MODULE_MAP.put("SALARY", "薪酬管理");
        BUSINESS_MODULE_MAP.put("RECRUITMENT", "招聘管理");
        BUSINESS_MODULE_MAP.put("ORGANIZATION", "组织架构");
        
        STATUS_MAP.put("SUCCESS", "成功");
        STATUS_MAP.put("FAILURE", "失败");
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void logOperation(String operationType, String businessModule, String businessType,
                            Long businessId, String businessNo, String operationDesc,
                            String beforeData, String afterData) {
        logOperation(operationType, businessModule, businessType, businessId, businessNo,
                    operationDesc, beforeData, afterData, null);
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void logOperation(String operationType, String businessModule, String businessType,
                            Long businessId, String businessNo, String operationDesc,
                            String beforeData, String afterData, String changeContent) {
        try {
            AuditLog auditLog = new AuditLog();
            auditLog.setLogType("OPERATION");
            auditLog.setOperationType(operationType);
            auditLog.setBusinessModule(businessModule);
            auditLog.setBusinessType(businessType);
            auditLog.setBusinessId(businessId);
            auditLog.setBusinessNo(businessNo);
            auditLog.setOperationDesc(operationDesc);
            auditLog.setBeforeData(beforeData);
            auditLog.setAfterData(afterData);
            auditLog.setChangeContent(changeContent);
            auditLog.setStatus("SUCCESS");
            auditLog.setArchived(0);
            
            // 从上下文获取操作人信息（实际项目中应从SecurityContext获取）
            // auditLog.setOperatorId(SecurityUtils.getUserId());
            // auditLog.setOperatorName(SecurityUtils.getUsername());
            // auditLog.setTenantId(SecurityUtils.getTenantId());
            // auditLog.setIpAddress(ServletUtils.getClientIP());
            
            auditLogMapper.insert(auditLog);
            log.info("记录操作日志成功: {}-{}-{}", businessModule, operationType, businessNo);
        } catch (Exception e) {
            log.error("记录操作日志失败: {}-{}-{}", businessModule, operationType, businessNo, e);
            // 审计日志记录失败不应影响业务操作，仅记录错误日志
        }
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void logApproval(String businessModule, String businessType,
                           Long businessId, String businessNo,
                           String approvalResult, String approvalComment) {
        try {
            AuditLog auditLog = new AuditLog();
            auditLog.setLogType("APPROVAL");
            auditLog.setOperationType(approvalResult);
            auditLog.setBusinessModule(businessModule);
            auditLog.setBusinessType(businessType);
            auditLog.setBusinessId(businessId);
            auditLog.setBusinessNo(businessNo);
            auditLog.setApprovalResult(approvalResult);
            auditLog.setApprovalComment(approvalComment);
            auditLog.setOperationDesc("审批操作: " + approvalResult);
            auditLog.setStatus("SUCCESS");
            auditLog.setArchived(0);
            
            // 从上下文获取操作人信息
            // auditLog.setOperatorId(SecurityUtils.getUserId());
            // auditLog.setOperatorName(SecurityUtils.getUsername());
            // auditLog.setTenantId(SecurityUtils.getTenantId());
            // auditLog.setIpAddress(ServletUtils.getClientIP());
            
            auditLogMapper.insert(auditLog);
            log.info("记录审批日志成功: {}-{}-{}", businessModule, approvalResult, businessNo);
        } catch (Exception e) {
            log.error("记录审批日志失败: {}-{}-{}", businessModule, approvalResult, businessNo, e);
            // 审计日志记录失败不应影响业务操作，仅记录错误日志
        }
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveAuditLog(AuditLog auditLog) {
        try {
            if (auditLog.getArchived() == null) {
                auditLog.setArchived(0);
            }
            if (auditLog.getStatus() == null) {
                auditLog.setStatus("SUCCESS");
            }
            auditLogMapper.insert(auditLog);
            log.debug("保存审计日志成功: {}", auditLog.getId());
        } catch (Exception e) {
            log.error("保存审计日志失败", e);
            // 审计日志记录失败不应影响业务操作，仅记录错误日志
        }
    }
    
    @Override
    public Page<AuditLogVO> queryAuditLogs(AuditLogQueryDTO queryDTO) {
        // 构建查询条件
        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(StringUtils.hasText(queryDTO.getLogType()), AuditLog::getLogType, queryDTO.getLogType())
               .eq(StringUtils.hasText(queryDTO.getOperationType()), AuditLog::getOperationType, queryDTO.getOperationType())
               .eq(StringUtils.hasText(queryDTO.getBusinessModule()), AuditLog::getBusinessModule, queryDTO.getBusinessModule())
               .eq(StringUtils.hasText(queryDTO.getBusinessType()), AuditLog::getBusinessType, queryDTO.getBusinessType())
               .eq(queryDTO.getBusinessId() != null, AuditLog::getBusinessId, queryDTO.getBusinessId())
               .eq(StringUtils.hasText(queryDTO.getBusinessNo()), AuditLog::getBusinessNo, queryDTO.getBusinessNo())
               .eq(queryDTO.getOperatorId() != null, AuditLog::getOperatorId, queryDTO.getOperatorId())
               .like(StringUtils.hasText(queryDTO.getOperatorName()), AuditLog::getOperatorName, queryDTO.getOperatorName())
               .eq(StringUtils.hasText(queryDTO.getStatus()), AuditLog::getStatus, queryDTO.getStatus())
               .eq(queryDTO.getArchived() != null, AuditLog::getArchived, queryDTO.getArchived())
               .ge(queryDTO.getStartTime() != null, AuditLog::getCreateTime, queryDTO.getStartTime())
               .le(queryDTO.getEndTime() != null, AuditLog::getCreateTime, queryDTO.getEndTime())
               .orderByDesc(AuditLog::getCreateTime);
        
        // 分页查询
        Page<AuditLog> page = new Page<>(queryDTO.getPageNum(), queryDTO.getPageSize());
        Page<AuditLog> resultPage = auditLogMapper.selectPage(page, wrapper);
        
        // 转换为VO
        Page<AuditLogVO> voPage = new Page<>(resultPage.getCurrent(), resultPage.getSize(), resultPage.getTotal());
        List<AuditLogVO> voList = resultPage.getRecords().stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
        voPage.setRecords(voList);
        
        return voPage;
    }
    
    @Override
    public AuditLogVO getAuditLogById(Long id) {
        AuditLog auditLog = auditLogMapper.selectById(id);
        if (auditLog == null) {
            return null;
        }
        return convertToVO(auditLog);
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public int archiveOldLogs(int days) {
        try {
            LocalDateTime beforeDate = LocalDateTime.now().minusDays(days);
            int batchSize = 1000; // 每批处理1000条
            int totalArchived = 0;
            
            while (true) {
                // 查询待归档的日志
                List<AuditLog> logsToArchive = auditLogMapper.selectLogsForArchive(beforeDate, batchSize);
                if (logsToArchive.isEmpty()) {
                    break;
                }
                
                // 批量更新归档状态
                List<Long> ids = logsToArchive.stream()
                        .map(AuditLog::getId)
                        .collect(Collectors.toList());
                int archived = auditLogMapper.batchUpdateArchiveStatus(ids, LocalDateTime.now());
                totalArchived += archived;
                
                log.info("归档审计日志: {} 条", archived);
                
                // 如果本批次少于批量大小，说明已经处理完毕
                if (logsToArchive.size() < batchSize) {
                    break;
                }
            }
            
            log.info("审计日志归档完成，共归档 {} 条", totalArchived);
            return totalArchived;
        } catch (Exception e) {
            log.error("归档审计日志失败", e);
            throw e;
        }
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public int deleteArchivedLogs(int days) {
        try {
            LocalDateTime beforeDate = LocalDateTime.now().minusDays(days);
            int deleted = auditLogMapper.deleteArchivedLogs(beforeDate);
            log.info("删除已归档的旧审计日志完成，共删除 {} 条", deleted);
            return deleted;
        } catch (Exception e) {
            log.error("删除已归档的旧审计日志失败", e);
            throw e;
        }
    }
    
    /**
     * 转换为VO对象
     */
    private AuditLogVO convertToVO(AuditLog auditLog) {
        AuditLogVO vo = new AuditLogVO();
        BeanUtils.copyProperties(auditLog, vo);
        
        // 设置描述信息
        vo.setLogTypeDesc(LOG_TYPE_MAP.getOrDefault(auditLog.getLogType(), auditLog.getLogType()));
        vo.setOperationTypeDesc(OPERATION_TYPE_MAP.getOrDefault(auditLog.getOperationType(), auditLog.getOperationType()));
        vo.setBusinessModuleDesc(BUSINESS_MODULE_MAP.getOrDefault(auditLog.getBusinessModule(), auditLog.getBusinessModule()));
        vo.setStatusDesc(STATUS_MAP.getOrDefault(auditLog.getStatus(), auditLog.getStatus()));
        
        return vo;
    }
}

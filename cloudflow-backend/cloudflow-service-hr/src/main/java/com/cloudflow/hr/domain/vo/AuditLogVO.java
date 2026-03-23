package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 审计日志VO
 * 
 * @author CloudFlow
 */
@Data
public class AuditLogVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 日志类型：OPERATION-操作日志 APPROVAL-审批日志
     */
    private String logType;
    
    /**
     * 日志类型描述
     */
    private String logTypeDesc;
    
    /**
     * 操作类型：CREATE-创建 UPDATE-修改 DELETE-删除 APPROVE-审批 REJECT-拒绝
     */
    private String operationType;
    
    /**
     * 操作类型描述
     */
    private String operationTypeDesc;
    
    /**
     * 业务模块
     */
    private String businessModule;
    
    /**
     * 业务模块描述
     */
    private String businessModuleDesc;
    
    /**
     * 业务类型
     */
    private String businessType;
    
    /**
     * 业务ID
     */
    private Long businessId;
    
    /**
     * 业务编号
     */
    private String businessNo;
    
    /**
     * 操作人ID
     */
    private Long operatorId;
    
    /**
     * 操作人姓名
     */
    private String operatorName;
    
    /**
     * 操作描述
     */
    private String operationDesc;
    
    /**
     * 变更前数据
     */
    private String beforeData;
    
    /**
     * 变更后数据
     */
    private String afterData;
    
    /**
     * 变更内容
     */
    private String changeContent;
    
    /**
     * 审批意见
     */
    private String approvalComment;
    
    /**
     * 审批结果
     */
    private String approvalResult;
    
    /**
     * IP地址
     */
    private String ipAddress;
    
    /**
     * 请求URI
     */
    private String requestUri;
    
    /**
     * 请求方法
     */
    private String requestMethod;
    
    /**
     * 执行时长（毫秒）
     */
    private Long executionTime;
    
    /**
     * 操作状态：SUCCESS-成功 FAILURE-失败
     */
    private String status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 错误信息
     */
    private String errorMessage;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 是否已归档
     */
    private Integer archived;
    
    /**
     * 归档时间
     */
    private LocalDateTime archiveTime;
}

package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 审计日志实体类
 * 用于记录系统中的关键操作和审批日志
 * 
 * @author CloudFlow
 */
@Data
@TableName("hr_audit_log")
public class AuditLog {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID（多租户隔离）
     */
    private Long tenantId;
    
    /**
     * 日志类型：OPERATION-操作日志 APPROVAL-审批日志
     */
    private String logType;
    
    /**
     * 操作类型：CREATE-创建 UPDATE-修改 DELETE-删除 APPROVE-审批 REJECT-拒绝
     */
    private String operationType;
    
    /**
     * 业务模块：EMPLOYEE-员工管理 ATTENDANCE-考勤管理 SALARY-薪酬管理 RECRUITMENT-招聘管理
     */
    private String businessModule;
    
    /**
     * 业务类型：具体的业务实体类型，如EMPLOYEE、LEAVE_APPLICATION、SALARY_ADJUSTMENT等
     */
    private String businessType;
    
    /**
     * 业务ID：关联的业务数据主键
     */
    private Long businessId;
    
    /**
     * 业务编号：业务数据的编号，如员工工号、申请编号等
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
     * 操作描述：简要描述本次操作
     */
    private String operationDesc;
    
    /**
     * 变更前数据：JSON格式存储变更前的数据快照
     */
    private String beforeData;
    
    /**
     * 变更后数据：JSON格式存储变更后的数据快照
     */
    private String afterData;
    
    /**
     * 变更内容：描述具体变更了哪些字段
     */
    private String changeContent;
    
    /**
     * 审批意见：审批操作时填写的意见
     */
    private String approvalComment;
    
    /**
     * 审批结果：APPROVED-通过 REJECTED-拒绝
     */
    private String approvalResult;
    
    /**
     * IP地址：操作人的IP地址
     */
    private String ipAddress;
    
    /**
     * 用户代理：浏览器信息
     */
    private String userAgent;
    
    /**
     * 请求URI：请求的接口路径
     */
    private String requestUri;
    
    /**
     * 请求方法：GET、POST、PUT、DELETE等
     */
    private String requestMethod;
    
    /**
     * 请求参数：JSON格式存储请求参数
     */
    private String requestParams;
    
    /**
     * 执行时长（毫秒）
     */
    private Long executionTime;
    
    /**
     * 操作状态：SUCCESS-成功 FAILURE-失败
     */
    private String status;
    
    /**
     * 错误信息：操作失败时的错误信息
     */
    private String errorMessage;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 是否已归档：0-未归档 1-已归档
     */
    private Integer archived;
    
    /**
     * 归档时间
     */
    private LocalDateTime archiveTime;
}

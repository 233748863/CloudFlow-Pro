package com.cloudflow.workflow.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.util.Date;

/**
 * 本地消息表 - 用于保证分布式事务最终一致性
 * 
 * R.4: 数据一致性保证的轻量化实现
 * 采用本地消息表模式，无需引入 Seata 等重量级框架
 * 
 * @author CloudFlow
 */
@Data
@TableName("wf_transaction_message")
public class WfTransactionMessage {
    
    /** 消息ID */
    @TableId(type = IdType.ASSIGN_UUID)
    private String messageId;
    
    /** 业务类型 (PROCESS_START, TASK_COMPLETE, TASK_REJECT, etc.) */
    private String businessType;
    
    /** 业务ID (instanceId, taskId, etc.) */
    private String businessId;
    
    /** 消息内容 (JSON格式) */
    private String content;
    
    /** 消息状态 (PENDING, PROCESSING, SUCCESS, FAILED) */
    private String status;
    
    /** 重试次数 */
    private Integer retryCount;
    
    /** 最大重试次数 */
    private Integer maxRetryCount;
    
    /** 下次重试时间 */
    private Date nextRetryTime;
    
    /** 创建时间 */
    private Date createTime;
    
    /** 更新时间 */
    private Date updateTime;
    
    /** 错误信息 */
    private String errorMessage;
    
    /** 租户ID */
    private Long tenantId;
}

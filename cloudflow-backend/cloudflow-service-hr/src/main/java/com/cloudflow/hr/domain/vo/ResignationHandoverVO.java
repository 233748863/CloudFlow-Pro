package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 离职交接VO
 * 
 * @author CloudFlow
 */
@Data
public class ResignationHandoverVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 离职申请ID
     */
    private Long applicationId;
    
    /**
     * 交接项目
     */
    private String handoverItem;
    
    /**
     * 交接类型：WORK-工作交接 ASSET-资产归还 DOCUMENT-文档交接 ACCOUNT-账号注销
     */
    private String handoverType;
    
    /**
     * 交接类型描述
     */
    private String handoverTypeDesc;
    
    /**
     * 交接对象ID
     */
    private Long handoverToId;
    
    /**
     * 交接对象姓名
     */
    private String handoverToName;
    
    /**
     * 状态：PENDING-待交接 COMPLETED-已完成
     */
    private String status;
    
    /**
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 完成时间
     */
    private LocalDateTime completedTime;
    
    /**
     * 备注
     */
    private String remark;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
}

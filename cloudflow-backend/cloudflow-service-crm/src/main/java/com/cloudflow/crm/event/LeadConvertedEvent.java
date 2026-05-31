package com.cloudflow.crm.event;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 线索转客户事件
 */
@Data
public class LeadConvertedEvent {

    /** 线索ID */
    private Long leadId;

    /** 线索编号 */
    private String leadNo;

    /** 线索名称 */
    private String leadName;

    /** 转换后的客户ID */
    private Long customerId;

    /** 客户名称 */
    private String customerName;

    /** 客户类型 */
    private String customerType;

    /** 原负责人ID */
    private Long originalOwnerId;

    /** 原负责人姓名 */
    private String originalOwnerName;

    /** 新负责人ID */
    private Long newOwnerId;

    /** 新负责人姓名 */
    private String newOwnerName;

    /** 转换时间 */
    private LocalDateTime convertedAt;
}

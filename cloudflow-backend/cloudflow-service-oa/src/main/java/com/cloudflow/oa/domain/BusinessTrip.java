package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Date;

/**
 * 出差申请实体类
 * 对应表：biz_business_trip
 */
@Data
@TableName("biz_business_trip")
public class BusinessTrip implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 主键ID */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 流程实例ID */
    private String instanceId;

    /** 申请人ID */
    private Long userId;

    /** 申请人姓名 */
    private String userName;

    /** 出差单号 */
    private String tripNo;

    /** 出差目的地 */
    private String destination;

    /** 出差开始日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date startDate;

    /** 出差结束日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date endDate;

    /** 出差天数 */
    private BigDecimal tripDays;

    /** 交通方式(PLANE/TRAIN/CAR/OTHER) */
    private String transportType;

    /** 预计费用 */
    private BigDecimal estimatedCost;

    /** 同行人员(JSON数组) */
    private String companions;

    /** 出差事由 */
    private String reason;

    /** 行程安排(JSON) */
    private String itinerary;

    /** 附件URL */
    private String attachmentUrl;

    /** 状态(DRAFT/PENDING/APPROVED/REJECTED/CANCELLED) */
    private String status;

    /** 部门ID */
    private Long deptId;

    /** 部门名称 */
    private String deptName;

    /** 删除标志 */
    private String delFlag;

    /** 创建者 */
    private String createBy;

    /** 创建时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;

    /** 更新者 */
    private String updateBy;

    /** 更新时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date updateTime;
}

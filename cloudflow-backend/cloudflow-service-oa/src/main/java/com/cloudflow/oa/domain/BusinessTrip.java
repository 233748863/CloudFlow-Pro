package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

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

    /** 出发地 */
    private String departure;

    /** 出差目的地 */
    private String destination;

    /** 出差开始日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    /** 出差结束日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;

    /** 出差天数 */
    private BigDecimal tripDays;

    /** 交通方式(PLANE/TRAIN/CAR/OTHER) */
    private String transportType;

    /** 预计费用 */
    private BigDecimal estimatedCost;

    /** 住宿安排(SELF自行安排/COMPANY公司安排/NONE无需住宿) */
    private String accommodation;

    /** 出差期间联系电话 */
    private String contactPhone;

    /** 紧急联系人 */
    private String emergencyContact;

    /** 紧急联系人电话 */
    private String emergencyPhone;

    /** 关联项目名称 */
    private String projectName;

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
    private LocalDateTime createTime;

    /** 更新者 */
    private String updateBy;

    /** 更新时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

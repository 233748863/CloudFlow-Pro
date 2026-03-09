package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 补卡/外勤申请实体类
 * 对应表：biz_attendance_appeal
 */
@Data
@TableName("biz_attendance_appeal")
public class AttendanceAppeal implements Serializable {
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

    /** 申请单号 */
    private String appealNo;

    /** 申请类型(MAKEUP补卡/FIELD外勤) */
    private String appealType;

    /** 补卡/外勤日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate appealDate;

    /** 补卡时间(补卡类型必填) */
    private String appealTime;

    /** 补卡打卡类型(1签到 2签退) */
    private String checkType;

    /** 关联原始考勤记录ID */
    private Long originalRecordId;

    /** 原始打卡状态(LATE迟到/EARLY早退/ABSENT缺卡/ABNORMAL异常) */
    private String originalStatus;

    /** 证明人姓名 */
    private String witnessName;

    /** 外勤地点经纬度 */
    private String location;

    /** 外勤地点地址 */
    private String address;

    /** 申请事由 */
    private String reason;

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

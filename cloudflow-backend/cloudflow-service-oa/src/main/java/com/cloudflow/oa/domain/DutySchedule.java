package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 值班排班实体类
 * 对应表：sys_duty_schedule
 */
@Data
@TableName("sys_duty_schedule")
public class DutySchedule implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 排班ID */
    @TableId(value = "schedule_id", type = IdType.AUTO)
    private Long scheduleId;

    /** 租户ID */
    private Long tenantId;

    /** 排班标题 */
    private String title;

    /** 排班类型(DAILY日常值班/HOLIDAY节假日值班/EMERGENCY应急值班) */
    private String scheduleType;

    /** 值班日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDateTime dutyDate;

    /** 班次(DAY白班/NIGHT夜班/FULL全天) */
    private String shiftType;

    /** 值班开始时间 */
    private String startTime;

    /** 值班结束时间 */
    private String endTime;

    /** 值班人ID */
    private Long userId;

    /** 值班人姓名 */
    private String userName;

    /** 替班人ID */
    private Long backupUserId;

    /** 替班人姓名 */
    private String backupUserName;

    /** 部门ID */
    private Long deptId;

    /** 部门名称 */
    private String deptName;

    /** 值班地点 */
    private String location;

    /** 值班内容/职责 */
    private String dutyContent;

    /** 签到时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime checkInTime;

    /** 签退时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime checkOutTime;

    /** 状态(SCHEDULED/CHECKED_IN/COMPLETED/SWAPPED/CANCELLED) */
    private String status;

    /** 换班原因 */
    private String swapReason;

    /** 备注 */
    private String remark;

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

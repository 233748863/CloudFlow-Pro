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
 * 加班申请实体类
 * 对应表：biz_overtime_request
 */
@Data
@TableName("biz_overtime_request")
public class OvertimeRequest implements Serializable {
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

    /** 加班单号 */
    private String overtimeNo;

    /** 加班类型(WORKDAY工作日/WEEKEND周末/HOLIDAY节假日) */
    private String overtimeType;

    /** 加班开始时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date startTime;

    /** 加班结束时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date endTime;

    /** 加班时长(小时) */
    private BigDecimal overtimeHours;

    /** 补偿方式(SALARY加班费/LEAVE调休) */
    private String compensateType;

    /** 加班事由 */
    private String reason;

    /** 加班工作内容 */
    private String workContent;

    /** 预计产出/成果 */
    private String expectedOutput;

    /** 是否需要用餐(0否 1是) */
    private Integer needMeal;

    /** 加班地点(OFFICE办公室/HOME居家/OTHER其他) */
    private String workLocation;

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

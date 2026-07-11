package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 访客预约实体类
 * 对应表：oa_visitor
 */
@Data
@TableName("oa_visitor")
public class Visitor implements Serializable {
    private static final long serialVersionUID = 1L;

    /** 访客记录ID */
    @TableId(value = "visitor_id", type = IdType.AUTO)
    private Long visitorId;

    /** 租户ID */
    private Long tenantId;

    /** 访客姓名 */
    private String visitorName;

    /** 访客电话 */
    private String visitorPhone;

    /** 访客单位 */
    private String visitorCompany;

    /** 来访人数 */
    private Integer visitorCount;

    /** 身份证号(脱敏存储) */
    private String idCard;

    /** 来访事由 */
    private String visitReason;

    /** 被访人ID */
    private Long hostId;

    /** 被访人姓名 */
    private String hostName;

    /** 被访人部门 */
    private String hostDept;

    /** 预约来访日期 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate visitDate;

    /** 预计到达时间 */
    private String visitTimeStart;

    /** 预计离开时间 */
    private String visitTimeEnd;

    /** 实际到达时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualArrive;

    /** 实际离开时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime actualLeave;

    /** 访问区域 */
    private String visitArea;

    /** 车牌号 */
    private String carPlate;

    /** 携带物品 */
    private String belongings;

    /** 访客照片URL */
    private String photoUrl;

    /** 通行证编号 */
    private String passCode;

    /** 工作流实例ID */
    private String processInstanceId;

    /** 状态(PENDING/APPROVING/APPROVAL_FAILED/REJECTED/CONFIRMED/ARRIVED/COMPLETED/CANCELLED) */
    private String status;

    /** 备注 */
    private String remark;

    /** 删除标志 */
    private Integer deleted;

    @Version
    private Integer version;
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

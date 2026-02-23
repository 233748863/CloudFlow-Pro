package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 付款申请实体类
 */
@Data
@TableName("biz_payment_request")
public class BizPaymentRequest implements Serializable {
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

    /** 付款单号 */
    private String paymentNo;

    /** 收款方名称 */
    private String payeeName;

    /** 收款账号 */
    private String payeeAccount;

    /** 开户行 */
    private String payeeBank;

    /** 付款金额 */
    private BigDecimal amount;

    /** 付款类型(PURCHASE采购/SERVICE服务/RENT租金/OTHER其他) */
    private String paymentType;

    /** 付款事由 */
    private String reason;

    /** 期望付款日期 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")

    private LocalDateTime expectedDate;

    /** 附件URL */
    private String attachmentUrl;

    /** 状态(DRAFT草稿/PENDING审批中/APPROVED已通过/REJECTED已驳回/PAID已打款) */
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

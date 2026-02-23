package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 报销申请实体类
 */
@Data
@TableName("biz_expense_claim")
public class BizExpenseClaim implements Serializable {
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

    /** 报销单号 */
    private String claimNo;

    /** 报销类别(TRAVEL差旅/OFFICE办公/ENTERTAIN招待/TRANSPORT交通/OTHER其他) */
    private String category;

    /** 总金额 */
    private BigDecimal totalAmount;

    /** 报销说明 */
    private String description;

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

    /** 报销明细列表（非数据库字段） */
    @TableField(exist = false)
    private List<BizExpenseItem> items;
}

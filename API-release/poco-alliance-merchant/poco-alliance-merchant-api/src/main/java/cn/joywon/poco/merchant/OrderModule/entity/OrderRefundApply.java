/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单退款申请表
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@TenantTable
@TableName("order_refund_applies")
@EqualsAndHashCode(callSuper = false)
@Schema(description = "订单退款申请表")
public class OrderRefundApply {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    /**
     * 订单ID
     */
    @TableField("order_id")
    @Schema(description = "订单ID")
    private Long orderId;

    /**
     * 退款单号
     */
    @TableField("refund_no")
    @Schema(description = "退款单号")
    private String refundNo;

    /**
     * 退款类型: FULL, PARTIAL
     */
    @TableField("refund_type")
    @Schema(description = "退款类型")
    private String refundType;

    /**
     * 退款金额(元,2位小数)
     */
    @TableField("apply_amount")
    @Schema(description = "退款金额(元)")
    private BigDecimal refundAmount;

    /**
     * 退款原因
     */
    @TableField("apply_reason")
    @Schema(description = "退款原因")
    private String refundReason;

    /**
     * 状态: PENDING, APPROVED, REJECTED, REFUNDED
     */
    @TableField("status")
    @Schema(description = "退款状态")
    private String status;

    /**
     * 申请人ID
     */
    @TableField("apply_user_id")
    @Schema(description = "申请人ID")
    private Long applicantId;

    /**
     * 审核人ID
     */
    @TableField("audit_by")
    @Schema(description = "审核人ID")
    private Long reviewerId;

    /**
     * 审核时间
     */
    @TableField("audit_time")
    @Schema(description = "审核时间")
    private LocalDateTime reviewTime;

    /**
     * 审核备注
     */
    @TableField("audit_remark")
    @Schema(description = "审核备注")
    private String reviewRemark;

    /**
     * 退款时间
     */
    @TableField("refund_time")
    @Schema(description = "退款时间")
    private LocalDateTime refundTime;

    /**
     * 创建人ID
     */
    @TableField(value = "created_by", fill = FieldFill.INSERT)
    @Schema(description = "创建人ID")
    private Long createdBy;

    /**
     * 创建时间
     */
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改人ID")
    private Long updatedBy;

    /**
     * 修改时间
     */
    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;

    /**
     * 是否已删除(软删除)
     */
    @TableLogic
    @TableField("is_deleted")
    @Schema(description = "是否已删除")
    private Integer isDeleted;

    /**
     * 删除时间(软删除)
     */
    @TableField("deleted_time")
    @Schema(description = "删除时间")
    private LocalDateTime deletedTime;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;
}
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
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 订单支付流水表
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@TenantTable
@TableName(value = "order_pay_records", autoResultMap = true)
@EqualsAndHashCode(callSuper = false)
@Schema(description = "订单支付流水表")
public class OrderPayRecord {

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
     * 支付通道: WECHAT_PAY 等
     */
    @TableField("channel")
    @Schema(description = "支付通道")
    private String channel;

    /**
     * 第三方支付单号
     */
    @TableField("trade_no")
    @Schema(description = "第三方支付单号")
    private String tradeNo;

    /**
     * 请求支付金额(元,2位小数)
     */
    @TableField("request_amount")
    @Schema(description = "请求支付金额(元)")
    private BigDecimal requestAmount;

    /**
     * 状态: INIT, PAYING, SUCCESS, FAIL
     */
    @TableField("status")
    @Schema(description = "支付状态")
    private String status;

    /**
     * 请求报文(JSON)
     */
    @TableField(value = "request_payload", typeHandler = JacksonTypeHandler.class)
    @Schema(description = "请求报文")
    private Map<String, Object> requestPayload;

    /**
     * 回调/响应报文(JSON)
     */
    @TableField(value = "response_payload", typeHandler = JacksonTypeHandler.class)
    @Schema(description = "回调/响应报文")
    private Map<String, Object> responsePayload;

    /**
     * 错误码
     */
    @TableField("error_code")
    @Schema(description = "错误码")
    private String errorCode;

    /**
     * 错误信息
     */
    @TableField("error_message")
    @Schema(description = "错误信息")
    private String errorMessage;

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
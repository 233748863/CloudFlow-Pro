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

package cn.joywon.poco.merchant.OrderModule.exception;

/**
 * 订单业务异常
 *
 * @author poco
 * @date 2025-11-02
 */
public class OrderBusinessException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /**
     * 错误码
     */
    private String errorCode;

    public OrderBusinessException() {
        super();
    }

    public OrderBusinessException(String message) {
        super(message);
    }

    public OrderBusinessException(String message, Throwable cause) {
        super(message, cause);
    }

    public OrderBusinessException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public OrderBusinessException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public void setErrorCode(String errorCode) {
        this.errorCode = errorCode;
    }

    /**
     * 订单不存在异常
     */
    public static OrderBusinessException orderNotFound(Long orderId) {
        return new OrderBusinessException("ORDER_NOT_FOUND", "订单不存在，订单ID: " + orderId);
    }

    /**
     * 订单状态异常
     */
    public static OrderBusinessException invalidOrderStatus(String currentStatus, String expectedStatus) {
        return new OrderBusinessException("INVALID_ORDER_STATUS", 
            String.format("订单状态异常，当前状态: %s，期望状态: %s", currentStatus, expectedStatus));
    }

    /**
     * 订单已过期异常
     */
    public static OrderBusinessException orderExpired(String orderNo) {
        return new OrderBusinessException("ORDER_EXPIRED", "订单已过期，订单号: " + orderNo);
    }

    /**
     * 库存不足异常
     */
    public static OrderBusinessException insufficientStock(Long skuId, Integer requestQuantity, Integer availableQuantity) {
        return new OrderBusinessException("INSUFFICIENT_STOCK", 
            String.format("库存不足，SKU ID: %d，请求数量: %d，可用数量: %d", skuId, requestQuantity, availableQuantity));
    }

    /**
     * 支付金额不匹配异常
     */
    public static OrderBusinessException paymentAmountMismatch(String orderNo, String expectedAmount, String actualAmount) {
        return new OrderBusinessException("PAYMENT_AMOUNT_MISMATCH", 
            String.format("支付金额不匹配，订单号: %s，期望金额: %s，实际金额: %s", orderNo, expectedAmount, actualAmount));
    }

    /**
     * 核销码无效异常
     */
    public static OrderBusinessException invalidVerificationCode(String verifyCode) {
        return new OrderBusinessException("INVALID_VERIFICATION_CODE", "核销码无效: " + verifyCode);
    }

    /**
     * 退款金额超出限制异常
     */
    public static OrderBusinessException refundAmountExceeded(String orderNo, String maxRefundAmount, String requestAmount) {
        return new OrderBusinessException("REFUND_AMOUNT_EXCEEDED", 
            String.format("退款金额超出限制，订单号: %s，最大可退金额: %s，申请退款金额: %s", orderNo, maxRefundAmount, requestAmount));
    }

    /**
     * 重复操作异常
     */
    public static OrderBusinessException duplicateOperation(String operation, String orderNo) {
        return new OrderBusinessException("DUPLICATE_OPERATION", 
            String.format("重复操作，操作类型: %s，订单号: %s", operation, orderNo));
    }
}
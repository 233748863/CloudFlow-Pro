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

package cn.joywon.poco.pay.utils;

import java.util.HashMap;
import java.util.Map;

/**
 * 支付平台与商户订单模块之间的订单状态映射工具类
 * <p>
 * 支付平台使用数字状态码 (OrderStatusEnum): "0", "1", "2", "5", "-1"
 * 商户模块使用语义化状态码: "PENDING_PAYMENT", "PAID", "COMPLETED", "REFUNDED", "CANCELLED"
 * </p>
 *
 * @author poco
 * @date 2025-12-30
 */
public class OrderStatusMapping {

    /**
     * 商户订单状态常量（与 poco-alliance-merchant 模块的 OrderStatusEnum 保持一致）
     */
    public static final String MERCHANT_PENDING_PAYMENT = "PENDING_PAYMENT";
    public static final String MERCHANT_PAID = "PAID";
    public static final String MERCHANT_PENDING_VERIFICATION = "PENDING_VERIFICATION";
    public static final String MERCHANT_COMPLETED = "COMPLETED";
    public static final String MERCHANT_CANCELLED = "CANCELLED";
    public static final String MERCHANT_REFUNDING = "REFUNDING";
    public static final String MERCHANT_REFUNDED = "REFUNDED";

    /**
     * 支付平台状态 -> 商户订单状态 映射
     */
    private static final Map<String, String> PAY_TO_MERCHANT_MAP = new HashMap<>();

    /**
     * 商户订单状态 -> 支付平台状态 映射
     */
    private static final Map<String, String> MERCHANT_TO_PAY_MAP = new HashMap<>();

    static {
        // 支付平台状态 -> 商户订单状态
        PAY_TO_MERCHANT_MAP.put(OrderStatusEnum.INIT.getStatus(), MERCHANT_PENDING_PAYMENT);
        PAY_TO_MERCHANT_MAP.put(OrderStatusEnum.SUCCESS.getStatus(), MERCHANT_PAID);
        PAY_TO_MERCHANT_MAP.put(OrderStatusEnum.COMPLETE.getStatus(), MERCHANT_COMPLETED);
        PAY_TO_MERCHANT_MAP.put(OrderStatusEnum.REFUND_SUCCESS.getStatus(), MERCHANT_REFUNDED);
        PAY_TO_MERCHANT_MAP.put(OrderStatusEnum.FAIL.getStatus(), MERCHANT_CANCELLED);

        // 商户订单状态 -> 支付平台状态
        MERCHANT_TO_PAY_MAP.put(MERCHANT_PENDING_PAYMENT, OrderStatusEnum.INIT.getStatus());
        MERCHANT_TO_PAY_MAP.put(MERCHANT_PAID, OrderStatusEnum.SUCCESS.getStatus());
        MERCHANT_TO_PAY_MAP.put(MERCHANT_PENDING_VERIFICATION, OrderStatusEnum.SUCCESS.getStatus());
        MERCHANT_TO_PAY_MAP.put(MERCHANT_COMPLETED, OrderStatusEnum.COMPLETE.getStatus());
        MERCHANT_TO_PAY_MAP.put(MERCHANT_CANCELLED, OrderStatusEnum.FAIL.getStatus());
        MERCHANT_TO_PAY_MAP.put(MERCHANT_REFUNDING, OrderStatusEnum.SUCCESS.getStatus()); // 退款中仍视为已支付
        MERCHANT_TO_PAY_MAP.put(MERCHANT_REFUNDED, OrderStatusEnum.REFUND_SUCCESS.getStatus());
    }

    /**
     * 将支付平台状态转换为商户订单状态
     *
     * @param payStatus 支付平台状态码 (如 "0", "1", "2")
     * @return 商户订单状态码 (如 "PENDING_PAYMENT", "PAID")
     */
    public static String toMerchantStatus(String payStatus) {
        return PAY_TO_MERCHANT_MAP.getOrDefault(payStatus, null);
    }

    /**
     * 将商户订单状态转换为支付平台状态
     *
     * @param merchantStatus 商户订单状态码 (如 "PENDING_PAYMENT", "PAID")
     * @return 支付平台状态码 (如 "0", "1")
     */
    public static String toPayStatus(String merchantStatus) {
        return MERCHANT_TO_PAY_MAP.getOrDefault(merchantStatus, null);
    }

    /**
     * 判断支付平台状态是否表示支付成功
     *
     * @param payStatus 支付平台状态码
     * @return true 表示支付成功
     */
    public static boolean isPaySuccess(String payStatus) {
        return OrderStatusEnum.SUCCESS.getStatus().equals(payStatus)
                || OrderStatusEnum.COMPLETE.getStatus().equals(payStatus);
    }

    /**
     * 判断商户订单状态是否表示已支付
     *
     * @param merchantStatus 商户订单状态码
     * @return true 表示已支付
     */
    public static boolean isMerchantPaid(String merchantStatus) {
        return MERCHANT_PAID.equals(merchantStatus)
                || MERCHANT_PENDING_VERIFICATION.equals(merchantStatus)
                || MERCHANT_COMPLETED.equals(merchantStatus);
    }
}

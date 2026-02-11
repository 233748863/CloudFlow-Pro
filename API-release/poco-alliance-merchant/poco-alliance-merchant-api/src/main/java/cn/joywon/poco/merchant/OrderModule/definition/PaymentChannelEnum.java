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

package cn.joywon.poco.merchant.OrderModule.definition;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 支付渠道枚举
 *
 * @author poco
 * @date 2025-11-02
 */
@Getter
@AllArgsConstructor
public enum PaymentChannelEnum {

    /**
     * 微信支付
     */
    WECHAT_PAY("WECHAT_PAY", "微信支付"),

    /**
     * 支付宝
     */
    ALIPAY("ALIPAY", "支付宝"),

    /**
     * 银联支付
     */
    UNIONPAY("UNIONPAY", "银联支付");

    /**
     * 渠道码
     */
    private final String code;

    /**
     * 渠道描述
     */
    private final String description;

    /**
     * 根据渠道码获取枚举
     *
     * @param code 渠道码
     * @return 支付渠道枚举
     */
    public static PaymentChannelEnum getByCode(String code) {
        for (PaymentChannelEnum channel : values()) {
            if (channel.getCode().equals(code)) {
                return channel;
            }
        }
        return null;
    }
}
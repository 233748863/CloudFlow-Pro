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
 * 取消申请状态枚举
 *
 * @author poco
 * @date 2025-12-30
 */
@Getter
@AllArgsConstructor
public enum CancelApplyStatusEnum {

    /**
     * 待审核
     */
    PENDING("PENDING", "待审核"),

    /**
     * 已通过
     */
    APPROVED("APPROVED", "已通过"),

    /**
     * 已拒绝
     */
    REJECTED("REJECTED", "已拒绝"),

    /**
     * 已取消
     */
    CANCELLED("CANCELLED", "已取消");

    /**
     * 状态码
     */
    private final String code;

    /**
     * 状态描述
     */
    private final String description;

    /**
     * 根据状态码获取枚举
     *
     * @param code 状态码
     * @return 取消申请状态枚举
     */
    public static CancelApplyStatusEnum getByCode(String code) {
        for (CancelApplyStatusEnum status : values()) {
            if (status.getCode().equals(code)) {
                return status;
            }
        }
        return null;
    }
}

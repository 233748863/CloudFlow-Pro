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

package cn.joywon.poco.merchant.OrderModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 订单取消审核DTO
 *
 * @author poco
 * @date 2025-11-23
 */
@Data
@Schema(description = "订单取消审核DTO")
public class OrderCancelAuditDTO {

    /**
     * 取消申请ID
     */
    @NotNull(message = "取消申请ID不能为空")
    @Schema(description = "取消申请ID", required = true)
    private Long cancelApplyId;

    /**
     * 是否通过
     */
    @NotNull(message = "审核结果不能为空")
    @Schema(description = "是否通过", required = true)
    private Boolean approved;

    /**
     * 审核备注
     */
    @Schema(description = "审核备注")
    private String auditRemark;
}

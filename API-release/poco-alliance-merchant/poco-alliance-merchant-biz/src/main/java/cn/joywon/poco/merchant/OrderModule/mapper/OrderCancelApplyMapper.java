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

package cn.joywon.poco.merchant.OrderModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.OrderModule.entity.OrderCancelApply;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 订单取消申请表
 *
 * @author poco
 * @date 2025-11-23
 */
@Mapper
public interface OrderCancelApplyMapper extends PocoBaseMapper<OrderCancelApply> {

    /**
     * 根据取消申请单号查询取消申请
     *
     * @param cancelNo 取消申请单号
     * @return 取消申请
     */
    OrderCancelApply getCancelApplyByCancelNo(@Param("cancelNo") String cancelNo);

    /**
     * 根据订单ID查询待审核的取消申请
     *
     * @param orderId 订单ID
     * @return 取消申请
     */
    OrderCancelApply getPendingCancelApplyByOrderId(@Param("orderId") Long orderId);
}

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
import cn.joywon.poco.merchant.OrderModule.entity.OrderItem;
import cn.joywon.poco.merchant.OrderModule.vo.OrderItemVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 订单商品表
 *
 * @author poco
 * @date 2025-11-02
 */
@Mapper
public interface OrderItemMapper extends PocoBaseMapper<OrderItem> {

    /**
     * 根据订单ID查询订单商品列表
     *
     * @param orderId 订单ID
     * @return 订单商品列表
     */
    List<OrderItemVO> getOrderItemsByOrderId(@Param("orderId") Long orderId);

    /**
     * 根据订单ID列表查询订单商品列表
     *
     * @param orderIds 订单ID列表
     * @return 订单商品列表
     */
    List<OrderItemVO> getOrderItemsByOrderIds(@Param("orderIds") List<Long> orderIds);

    /**
     * 根据SKU ID查询订单商品列表
     *
     * @param productSkuId SKU ID
     * @return 订单商品列表
     */
    List<OrderItem> getOrderItemsBySkuId(@Param("productSkuId") Long productSkuId);
}
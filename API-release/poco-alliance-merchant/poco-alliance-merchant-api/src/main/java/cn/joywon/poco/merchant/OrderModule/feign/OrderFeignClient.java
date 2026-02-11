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

package cn.joywon.poco.merchant.OrderModule.feign;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.OrderModule.dto.OrderAddressUpdateDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderCreateDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderLocalDeliveryCompleteDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderLocalDeliveryStartDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderPageQueryDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderPayDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderRefundApplyDTO;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.vo.OrderDetailVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderListVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderPayResultVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

/**
 * 订单Feign接口
 *
 * @author poco
 * @date 2025-11-02
 */
@FeignClient(contextId = "orderFeignClient", value = ServiceNameConstants.MERCHANT_SERVICE)
public interface OrderFeignClient {

    /**
     * 创建订单
     *
     * @param orderCreateDTO 订单创建DTO
     * @return 订单ID
     */
    @PostMapping("/order/create")
    R<Long> createOrder(@RequestBody OrderCreateDTO orderCreateDTO);

    /**
     * 根据ID获取订单详情
     *
     * @param orderId 订单ID
     * @return 订单详情VO
     */
    @GetMapping("/order/detail/{orderId}")
    R<OrderDetailVO> getOrderDetail(@PathVariable("orderId") Long orderId);

    /**
     * 分页查询订单列表
     *
     * @param orderPageQueryDTO 分页条件查询参数
     * @return 订单列表分页结果
     */
    @PostMapping("/order/page")
    R<IPage<OrderListVO>> getOrderPage(@RequestBody OrderPageQueryDTO orderPageQueryDTO);

    /**
     * 订单支付
     *
     * @param orderPayDTO 订单支付DTO
     * @return 支付结果VO
     */
    @PostMapping("/order/pay")
    R<OrderPayResultVO> payOrder(@RequestBody OrderPayDTO orderPayDTO);

    /**
     * 订单核销
     *
     * @param orderId 订单ID
     * @param verifyCode 核销码
     * @return 是否成功
     */
    @PostMapping("/order/verify/{orderId}")
    R<Boolean> verifyOrder(@PathVariable("orderId") Long orderId, @RequestParam("verifyCode") String verifyCode);

    /**
     * 取消订单
     *
     * @param orderId 订单ID
     * @param cancelReason 取消原因
     * @return 是否成功
     */
    @PostMapping("/order/cancel/{orderId}")
    R<Boolean> cancelOrder(@PathVariable("orderId") Long orderId, @RequestParam("cancelReason") String cancelReason);

    /**
     * 申请退款
     *
     * @param orderRefundApplyDTO 退款申请DTO
     * @return 是否成功
     */
    @PostMapping("/order/refund/apply")
    R<Boolean> applyRefund(@RequestBody OrderRefundApplyDTO orderRefundApplyDTO);

    /**
     * 审核退款
     *
     * @param refundId 退款申请ID
     * @param approved 是否通过
     * @param auditRemark 审核备注
     * @return 是否成功
     */
    @PostMapping("/order/refund/audit/{refundId}")
    R<Boolean> auditRefund(@PathVariable("refundId") Long refundId,
                           @RequestParam("approved") Boolean approved,
                           @RequestParam(value = "auditRemark", required = false) String auditRemark);

    /**
     * 根据门店ID查询订单列表
     *
     * @param storeId 门店ID
     * @param current 当前页
     * @param size 每页大小
     * @return 订单列表分页
     */
    /**
     * 根据门店ID查询订单列表
     *
     * @param storeId 门店ID
     * @return 订单列表
     */
    @GetMapping("/order/store/{storeId}")
    R<List<OrderListVO>> getOrdersByStoreId(@PathVariable("storeId") Long storeId);

    /**
     * 根据用户ID查询订单列表
     *
     * @param userId 用户ID
     * @param current 当前页
     * @param size 每页大小
     * @return 订单列表分页
     */
    /**
     * 根据用户ID查询订单列表
     *
     * @param userId 用户ID
     * @return 订单列表
     */
    @GetMapping("/order/user/{userId}")
    R<List<OrderListVO>> getOrdersByUserId(@PathVariable("userId") Long userId);

    /**
     * 根据订单号查询订单
     *
     * @param orderNo 订单号
     * @return 订单信息
     */
    @GetMapping("/order/orderNo/{orderNo}")
    R<Order> getOrderByOrderNo(@PathVariable("orderNo") String orderNo);

    /**
     * 消费者分页查询订单列表
     *
     * @param orderPageQueryDTO 分页条件查询参数
     * @return 订单列表分页结果
     */
    @PostMapping("/order/consumer/page")
    R<IPage<OrderListVO>> getConsumerOrderPage(@RequestBody OrderPageQueryDTO orderPageQueryDTO);

    /**
     * 消费者获取订单详情
     *
     * @param orderId 订单ID
     * @return 订单详情VO
     */
    @GetMapping("/order/consumer/detail/{orderId}")
    R<OrderDetailVO> getOrderDetailForConsumer(@PathVariable("orderId") Long orderId);

    /**
     * 更新订单状态
     *
     * @param orderId 订单ID
     * @param status 新状态(字符串枚举)
     * @return 是否成功
     */
    @PutMapping("/order/status/{orderId}")
    R<Boolean> updateOrderStatus(@PathVariable("orderId") Long orderId, @RequestParam("status") String status);

    /**
     * 批量更新订单状态
     *
     * @param orderIds 订单ID列表
     * @param status 新状态(字符串枚举)
     * @return 是否成功
     */
    @PutMapping("/order/status/batch")
    R<Boolean> batchUpdateOrderStatus(@RequestBody List<Long> orderIds, @RequestParam("status") String status);

    /**
     * 支付前更新订单收货地址（写入地址快照）
     *
     * @param addressUpdateDTO 地址更新DTO
     * @return 是否成功
     */
    @PutMapping("/order/address/update")
    R<Boolean> updateOrderAddress(@RequestBody OrderAddressUpdateDTO addressUpdateDTO);

    /**
     * 本地配送开始（记录配送员信息并置为配送中）
     *
     * @param startDTO 本地配送开始DTO
     * @return 是否成功
     */
    @PostMapping("/order/delivery/local/start")
    R<Boolean> startLocalDelivery(@RequestBody OrderLocalDeliveryStartDTO startDTO);

    /**
     * 本地配送完成（置为已送达并尝试完成订单）
     *
     * @param completeDTO 本地配送完成DTO
     * @return 是否成功
     */
    @PostMapping("/order/delivery/local/complete")
    R<Boolean> completeLocalDelivery(@RequestBody OrderLocalDeliveryCompleteDTO completeDTO);

    /**
     * 退款成功回调（内部调用）
     *
     * @param refundNo 退款单号
     * @return 是否成功
     */
    @PostMapping("/order/refund/success")
    R<Boolean> refundSuccess(@RequestParam("refundNo") String refundNo);

    /**
     * 用户主动完成订单
     *
     * @param orderId 订单ID
     * @return 是否成功
     */
    @PostMapping("/order/complete/{orderId}")
    R<Boolean> completeOrderByUser(@PathVariable("orderId") Long orderId);
}
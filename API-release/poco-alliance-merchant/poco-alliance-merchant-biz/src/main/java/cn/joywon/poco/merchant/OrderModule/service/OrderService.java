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

package cn.joywon.poco.merchant.OrderModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.OrderModule.dto.*;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.vo.OrderDetailVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderListVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderPayResultVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderRefundApplyDetailVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderRefundApplyVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import java.util.List;

/**
 * 订单服务接口
 *
 * @author poco
 * @date 2025-11-02
 */
public interface OrderService extends IService<Order> {

  /**
   * 创建订单
   *
   * @param orderCreateDTO 订单创建DTO
   * @return 创建结果
   */
  R<String> createOrder(OrderCreateDTO orderCreateDTO);

  /**
   * 购物车下单V2（重构后，支持多商家拆单）
   *
   * <p>重构后的购物车下单接口，简化了优惠券计算逻辑：
   *
   * <ul>
   *   <li>每个商家只能使用1张商家券
   *   <li>全局只能使用1张平台券
   *   <li>支持每个商家独立的履约方式和收货地址
   *   <li>前端按商家整理好订单数据（merchantOrders）
   * </ul>
   *
   * <p>主要流程：
   *
   * <ol>
   *   <li>幂等性校验（Redis SETNX）
   *   <li>校验商家订单数据（merchantOrders 不为空，每个商家订单包含 merchantId 和 items）
   *   <li>批量查询 SKU 详情
   *   <li>计算商家券优惠（基于商品原价）
   *   <li>计算平台券优惠（基于所有商家折后价总和）
   *   <li>平台券优惠按比例分摊到各商家
   *   <li>创建子订单（每个商家一个）
   *   <li>生成统一的支付批次号
   * </ol>
   *
   * @param orderCreateFromCartDTO 购物车下单DTO（使用新的 merchantOrders 结构）
   * @return 订单ID列表
   */
  R<List<String>> createOrderFromCart(OrderCreateFromCartDTO orderCreateFromCartDTO);

  /**
   * 消费者获取订单详情
   *
   * @param orderId 订单ID
   * @return 订单详情
   */
  R<OrderDetailVO> getOrderDetailForConsumer(Long orderId);

  /**
   * 分页查询订单列表
   *
   * @return 订单列表分页
   */
  IPage<OrderListVO> getOrderPage(OrderPageQueryDTO orderPageQueryDTO);

  /**
   * 消费者分页查询订单列表（当前登录用户）
   *
   * @return 订单列表分页
   */
  IPage<OrderListVO> getConsumerOrderPage(OrderPageQueryDTO orderPageQueryDTO);

  /**
   * 订单支付
   *
   * @param orderPayDTO 订单支付DTO
   * @return 支付结果
   */
  R<OrderPayResultVO> payOrder(OrderPayDTO orderPayDTO);

  /**
   * 订单核销
   *
   * @param orderId 订单ID
   * @param verifyCode 核销码
   * @return 核销结果
   */
  R<Boolean> verifyOrder(Long orderId, String verifyCode);

  /**
   * 取消订单
   *
   * @param orderId 订单ID
   * @param cancelReason 取消原因
   * @return 取消结果
   */
  R<Boolean> cancelOrder(Long orderId, String cancelReason);

  /**
   * 消费者取消订单（未支付直接取消，已支付创建取消申请）
   *
   * @param orderId 订单ID
   * @param cancelReason 取消原因
   * @return 取消结果（已支付订单返回取消申请ID）
   */
  R<Long> consumerCancelOrder(Long orderId, String cancelReason);

  /**
   * 商家审核取消申请
   *
   * @param cancelApplyId 取消申请ID
   * @param approved 是否通过
   * @param auditRemark 审核备注
   * @return 审核结果
   */
  R<Boolean> auditCancelApply(Long cancelApplyId, Boolean approved, String auditRemark);

  /**
   * 自动审核通过取消申请（24小时未审核自动通过）
   *
   * @param cancelApplyId 取消申请ID
   * @return 审核结果
   */
  R<Boolean> autoApproveCancelApply(Long cancelApplyId);

  /**
   * 申请退款
   *
   * @param orderRefundApplyDTO 退款申请DTO
   * @return 申请结果
   */
  R<Boolean> applyRefund(OrderRefundApplyDTO orderRefundApplyDTO);

  /**
   * 审核退款
   *
   * @param refundId 退款申请ID
   * @param approved 是否通过
   * @param auditRemark 审核备注
   * @return 审核结果
   */
  R<Boolean> auditRefund(Long refundId, Boolean approved, String auditRemark);

  /**
   * 更新订单状态
   *
   * @param orderId 订单ID
   * @param status 新状态
   * @return 更新结果
   */
  R<Boolean> updateOrderStatus(Long orderId, String status);

  /**
   * 批量更新订单状态
   *
   * @param orderIds 订单ID列表
   * @param status 新状态
   * @return 更新结果
   */
  R<Boolean> batchUpdateOrderStatus(List<Long> orderIds, String status);

  /** 本地配送开始（记录配送员信息并置为配送中） */
  R<Boolean> startLocalDelivery(OrderLocalDeliveryStartDTO startDTO);

  /** 本地配送完成（置为已送达并尝试完成订单） */
  R<Boolean> completeLocalDelivery(OrderLocalDeliveryCompleteDTO completeDTO);

  /**
   * 消费者更新订单收货地址
   *
   * @param addressUpdateDTO 地址更新DTO
   * @return 更新结果
   */
  R<Boolean> consumerUpdateOrderAddress(OrderAddressUpdateDTO addressUpdateDTO);

  /**
   * 商家更新订单收货地址
   *
   * @param addressUpdateDTO 地址更新DTO
   * @return 更新结果
   */
  R<Boolean> merchantUpdateOrderAddress(OrderAddressUpdateDTO addressUpdateDTO);

  /** 用户主动完成订单（满足基础条件则将订单置完成） */
  R<Boolean> completeOrderByUser(Long orderId);

  /**
   * 支付成功回调
   *
   * @param orderNo 订单号
   */
  void paySuccess(String orderNo);

  /**
   * 退款成功回调
   *
   * @param refundNo 退款单号
   */
  void refundSuccess(String refundNo);

  /**
   * 关闭超时未支付订单
   *
   * @param orderId 订单ID
   */
  void closeOverdueOrder(Long orderId);

  /**
   * 消费者删除订单（软删除）
   *
   * @param orderId 订单ID
   * @return 删除结果
   */
  R<Boolean> deleteOrderForConsumer(Long orderId);

  /**
   * 触发订单分账
   *
   * @param order 订单实体
   */
  void triggerProfitSharing(Order order);

  /**
   * 分页查询退款申请列表（商家后台）
   *
   * @param queryDTO 查询条件
   * @return 退款申请列表
   */
  IPage<OrderRefundApplyVO> getRefundApplyPage(RefundApplyPageQueryDTO queryDTO);

  /**
   * 分页查询退款申请列表（消费者端）
   *
   * @param queryDTO 查询条件
   * @return 退款申请列表
   */
  IPage<OrderRefundApplyVO> getConsumerRefundApplyPage(RefundApplyPageQueryDTO queryDTO);

  /**
   * 获取退款申请详情
   *
   * @param refundApplyId 退款申请ID
   * @return 退款申请详情
   */
  R<OrderRefundApplyDetailVO> getRefundApplyDetail(Long refundApplyId);

  /**
   * 多条件查询订单详情（支持订单ID、订单号等多种查询条件）
   *
   * @param queryDTO 查询条件DTO
   * @return 订单详情
   */
  R<OrderDetailVO> queryOrderDetail(OrderQueryDTO queryDTO);
}

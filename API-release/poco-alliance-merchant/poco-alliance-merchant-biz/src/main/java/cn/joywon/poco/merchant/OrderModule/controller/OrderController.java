package cn.joywon.poco.merchant.OrderModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.OrderModule.dto.OrderAddressUpdateDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderCancelAuditDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderCreateDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderCreateFromCartDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderLocalDeliveryCompleteDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderLocalDeliveryStartDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderPageQueryDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderPayDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderQueryDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderRefundApplyDTO;
import cn.joywon.poco.merchant.OrderModule.dto.OrderRefundAuditDTO;
import cn.joywon.poco.merchant.OrderModule.dto.RefundApplyPageQueryDTO;
import cn.joywon.poco.merchant.OrderModule.service.OrderService;
import cn.joywon.poco.merchant.OrderModule.vo.OrderDetailVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderListVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderPayResultVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderRefundApplyDetailVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderRefundApplyVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

/**
 * 订单管理控制器
 *
 * @author poco
 * @date 2025-11-02
 */
@RestController
@AllArgsConstructor
@RequestMapping("/order")
@Tag(name = "订单管理", description = "订单管理相关接口")
@Slf4j
public class OrderController {

  private final OrderService orderService;

  // ==================== 消费者端接口 ====================

  /**
   * 创建订单（消费者）
   *
   * @param orderCreateDTO 订单创建信息
   * @return 订单ID
   */
  @PostMapping("/consumer/create")
  @Operation(summary = "创建订单", description = "消费者创建新订单")
  @SysLog("创建订单")
  public R<String> createOrder(@Valid @RequestBody OrderCreateDTO orderCreateDTO) {
    log.info("创建订单请求: {}", orderCreateDTO);
    return orderService.createOrder(orderCreateDTO);
  }

  /**
   * 购物车下单（消费者）
   * 
   * 使用新版购物车下单API (V2版本)
   * - 支持每个商家独立的商家券
   * - 支持全局平台券
   * - 支持每个商家独立的履约方式和收货地址
   * - 优化了优惠券计算和分摊逻辑
   *
   * @param orderCreateFromCartDTO 购物车下单信息
   * @return 订单ID列表
   */
  @PostMapping("/consumer/create/cart")
  @Operation(summary = "购物车下单", description = "消费者从购物车下单（支持多商家拆单）")
  @SysLog("购物车下单")
  public R<List<String>> createOrderFromCart(
      @Valid @RequestBody OrderCreateFromCartDTO orderCreateFromCartDTO) {
    log.info("购物车下单请求: {}", orderCreateFromCartDTO);
    // 调用新版购物车下单API
    return orderService.createOrderFromCart(orderCreateFromCartDTO);
  }

  /**
   * 消费者分页查询订单列表
   *
   * @return 订单列表
   */
  @PostMapping("/consumer/page")
  @Operation(summary = "消费者分页查询订单列表", description = "分页查询当前用户订单列表，使用DTO")
  public R<IPage<OrderListVO>> getConsumerOrderPage(
      @Valid @RequestBody OrderPageQueryDTO orderPageQueryDTO) {
    log.info("消费者分页查询订单列表，请求参数: {}", orderPageQueryDTO);
    IPage<OrderListVO> result = orderService.getConsumerOrderPage(orderPageQueryDTO);
    return R.ok(result);
  }

  /**
   * 消费者获取订单详情
   *
   * @param orderId 订单ID
   * @return 订单详情
   */
  @GetMapping("/consumer/detail/{orderId}")
  @Operation(summary = "消费者获取订单详情", description = "根据订单ID获取当前用户订单详情")
  public R<OrderDetailVO> getOrderDetailForConsumer(@PathVariable("orderId") Long orderId) {
    log.info("消费者获取订单详情，订单ID: {}", orderId);
    return orderService.getOrderDetailForConsumer(orderId);
  }

  /**
   * 订单支付（消费者）
   *
   * @param orderPayDTO 支付信息
   * @return 支付结果
   */
  @PostMapping("/pay")
  @Operation(summary = "订单支付", description = "消费者发起订单支付")
  @SysLog("订单支付")
  public R<OrderPayResultVO> payOrder(@Valid @RequestBody OrderPayDTO orderPayDTO) {
    log.info("订单支付请求: {}", orderPayDTO);
    return orderService.payOrder(orderPayDTO);
  }

  /**
   * 消费者取消订单
   *
   * @param orderId 订单ID
   * @param cancelReason 取消原因
   * @return 取消结果
   */
  @PostMapping("/consumer/cancel/{orderId}")
  @Operation(summary = "消费者取消订单", description = "消费者取消自己的订单（未支付直接取消，已支付创建取消申请）")
  @SysLog("消费者取消订单")
  public R<Long> consumerCancelOrder(
      @PathVariable("orderId") Long orderId,
      @Parameter(description = "取消原因") @RequestParam(value = "cancelReason", required = false)
          String cancelReason) {
    log.info("消费者取消订单请求，订单ID: {}, 取消原因: {}", orderId, cancelReason);
    return orderService.consumerCancelOrder(orderId, cancelReason);
  }

  /**
   * 消费者删除订单（软删除）
   *
   * @param orderId 订单ID
   * @return 删除结果
   */
  @PostMapping("/consumer/delete/{orderId}")
  @Operation(summary = "消费者删除订单", description = "消费者删除自己的订单（仅已完成/已取消/已退款状态可删除）")
  @SysLog("消费者删除订单")
  public R<Boolean> deleteOrderForConsumer(@PathVariable("orderId") Long orderId) {
    log.info("消费者删除订单请求，订单ID: {}", orderId);
    return orderService.deleteOrderForConsumer(orderId);
  }

  /**
   * 审核取消申请（商家）
   *
   * @param auditDTO 审核信息
   * @return 审核结果
   */
  @PostMapping("/cancel/audit")
  @Operation(summary = "审核取消申请", description = "商家审核订单取消申请")
  @SysLog("审核取消申请")
  @HasPermission("merchant_order_audit")
  public R<Boolean> auditCancelApply(@Valid @RequestBody OrderCancelAuditDTO auditDTO) {
    log.info("审核取消申请请求: {}", auditDTO);
    return orderService.auditCancelApply(
        auditDTO.getCancelApplyId(), auditDTO.getApproved(), auditDTO.getAuditRemark());
  }

  /**
   * 申请退款（消费者）
   *
   * @param orderRefundApplyDTO 退款申请信息
   * @return 申请结果
   */
  @PostMapping("/refund/apply")
  @Operation(summary = "申请退款", description = "消费者申请订单退款")
  @SysLog("申请退款")
  public R<Boolean> applyRefund(@Valid @RequestBody OrderRefundApplyDTO orderRefundApplyDTO) {
    log.info("申请退款请求: {}", orderRefundApplyDTO);
    return orderService.applyRefund(orderRefundApplyDTO);
  }

  /**
   * 消费者分页查询退款申请列表
   *
   * @param queryDTO 查询条件
   * @return 退款申请列表
   */
  @PostMapping("/consumer/refund/page")
  @Operation(summary = "消费者分页查询退款申请列表", description = "消费者查询自己的退款申请列表")
  public R<IPage<OrderRefundApplyVO>> getConsumerRefundApplyPage(
      @Valid @RequestBody RefundApplyPageQueryDTO queryDTO) {
    log.info("消费者分页查询退款申请列表，请求参数: {}", queryDTO);
    return R.ok(orderService.getConsumerRefundApplyPage(queryDTO));
  }

  /**
   * 审核退款申请（商家）
   *
   * @param auditDTO 审核信息
   * @return 审核结果
   */
  @PostMapping("/refund/audit")
  @Operation(summary = "审核退款申请", description = "商家审核订单退款申请")
  @SysLog("审核退款申请")
  @HasPermission("merchant_order_audit")
  public R<Boolean> auditRefund(@Valid @RequestBody OrderRefundAuditDTO auditDTO) {
    log.info("审核退款申请请求: {}", auditDTO);
    return orderService.auditRefund(
        auditDTO.getRefundApplyId(), auditDTO.getApproved(), auditDTO.getAuditRemark());
  }

  /**
   * 分页查询退款申请列表（商家后台）
   *
   * @param queryDTO 查询条件
   * @return 退款申请列表
   */
  @PostMapping("/refund/page")
  @Operation(summary = "分页查询退款申请列表", description = "商家分页查询退款申请列表")
  @HasPermission("merchant_order_audit")
  public R<IPage<OrderRefundApplyVO>> getRefundApplyPage(
      @Valid @RequestBody RefundApplyPageQueryDTO queryDTO) {
    log.info("分页查询退款申请列表，请求参数: {}", queryDTO);
    return R.ok(orderService.getRefundApplyPage(queryDTO));
  }

  /**
   * 获取退款申请详情（商家后台）
   *
   * @param refundApplyId 退款申请ID
   * @return 退款申请详情
   */
  @GetMapping("/refund/detail/{refundApplyId}")
  @Operation(summary = "获取退款申请详情", description = "商家获取退款申请详情，包含退款商品明细")
  @HasPermission("merchant_order_audit")
  public R<OrderRefundApplyDetailVO> getRefundApplyDetail(
      @PathVariable("refundApplyId") Long refundApplyId) {
    log.info("获取退款申请详情，退款申请ID: {}", refundApplyId);
    return orderService.getRefundApplyDetail(refundApplyId);
  }

  /**
   * 用户主动完成订单（消费者）
   *
   * @param orderId 订单ID
   * @return 完成结果
   */
  @PostMapping("/consumer/complete/{orderId}")
  @Operation(summary = "用户主动完成订单", description = "消费者主动完成订单")
  @SysLog("用户主动完成订单")
  public R<Boolean> completeOrderByUser(@PathVariable("orderId") Long orderId) {
    log.info("用户主动完成订单请求，订单ID: {}", orderId);
    return orderService.completeOrderByUser(orderId);
  }

  /**
   * 退款成功回调（内部调用）
   *
   * @param refundNo 退款单号
   * @return 处理结果
   */
  @PostMapping("/refund/success")
  @Operation(summary = "退款成功回调", description = "支付平台调用，通知订单服务退款成功")
  @SysLog("退款成功回调")
  public R<Boolean> refundSuccess(@RequestParam("refundNo") String refundNo) {
    log.info("收到退款成功回调，退款单号: {}", refundNo);
    try {
      orderService.refundSuccess(refundNo);
      return R.ok(true);
    } catch (Exception e) {
      log.error("处理退款成功回调失败，退款单号: {}", refundNo, e);
      return R.failed("处理退款成功回调失败: " + e.getMessage());
    }
  }

  /**
   * 消费者更新订单收货地址
   *
   * @param addressUpdateDTO 地址更新信息
   * @return 更新结果
   */
  @PutMapping("/consumer/address/update")
  @Operation(summary = "消费者更新订单收货地址", description = "消费者更新自己订单的收货地址（仅支付前允许）")
  @SysLog("消费者更新订单收货地址")
  public R<Boolean> consumerUpdateOrderAddress(
      @Valid @RequestBody OrderAddressUpdateDTO addressUpdateDTO) {
    log.info("消费者更新订单收货地址请求: {}", addressUpdateDTO);
    return orderService.consumerUpdateOrderAddress(addressUpdateDTO);
  }

  // ==================== 商家后台接口 ====================

  /**
   * 分页查询订单列表（商家后台）
   *
   * @return 订单列表
   */
  @PostMapping("/page")
  @Operation(summary = "分页查询订单列表", description = "分页+多条件查询，使用DTO")
  @HasPermission("merchant_order_view")
  public R<IPage<OrderListVO>> getOrderPage(
      @Valid @RequestBody OrderPageQueryDTO orderPageQueryDTO) {
    log.info("分页查询订单列表，请求参数: {}", orderPageQueryDTO);
    IPage<OrderListVO> result = orderService.getOrderPage(orderPageQueryDTO);
    return R.ok(result);
  }

  /**
   * 多条件查询订单详情（商家后台）- 统一查询接口 支持通过订单ID、订单号、用户ID、门店ID、商家ID、订单状态、支付方式、
   * 支付流水号、核销码、支付批次号、履约模式、优惠券ID等多种条件查询订单详情
   *
   * @param queryDTO 查询条件DTO
   * @return 订单详情
   */
  @PostMapping("/query")
  @Operation(
      summary = "多条件查询订单详情",
      description =
          "支持通过订单ID、订单号、用户ID、门店ID、商家ID、订单状态、支付方式、支付流水号、核销码、支付批次号、履约模式、优惠券ID、时间范围等多种条件查询订单详情")
  @HasPermission("merchant_order_view")
  public R<OrderDetailVO> queryOrderDetail(@Valid @RequestBody OrderQueryDTO queryDTO) {
    log.info("多条件查询订单详情，查询条件: {}", queryDTO);
    return orderService.queryOrderDetail(queryDTO);
  }

  /**
   * 订单核销（商家后台）
   *
   * @param orderId 订单ID
   * @param verifyCode 核销码
   * @return 核销结果
   */
  @PostMapping("/verify/{orderId}")
  @Operation(summary = "订单核销", description = "核销订单")
  @SysLog("订单核销")
  @HasPermission("merchant_order_verify")
  public R<Boolean> verifyOrder(
      @PathVariable("orderId") Long orderId,
      @Parameter(description = "核销码") @RequestParam("verifyCode") String verifyCode) {
    log.info("订单核销请求，订单ID: {}, 核销码: {}", orderId, verifyCode);
    return orderService.verifyOrder(orderId, verifyCode);
  }

  /**
   * 取消订单（商家后台）
   *
   * @param orderId 订单ID
   * @param cancelReason 取消原因
   * @return 取消结果
   */
  @PostMapping("/cancel/{orderId}")
  @Operation(summary = "取消订单", description = "取消订单")
  @SysLog("取消订单")
  @HasPermission("merchant_order_cancel")
  public R<Boolean> cancelOrder(
      @PathVariable("orderId") Long orderId,
      @Parameter(description = "取消原因") @RequestParam(value = "cancelReason", required = false)
          String cancelReason) {
    log.info("取消订单请求，订单ID: {}, 取消原因: {}", orderId, cancelReason);
    return orderService.cancelOrder(orderId, cancelReason);
  }

  /**
   * 更新订单状态（商家后台）
   *
   * @param orderId 订单ID
   * @param status 新状态
   * @return 更新结果
   */
  @PutMapping("/status/{orderId}")
  @Operation(summary = "更新订单状态", description = "更新订单状态")
  @SysLog("更新订单状态")
  @HasPermission("merchant_order_update")
  public R<Boolean> updateOrderStatus(
      @PathVariable("orderId") Long orderId,
      @Parameter(description = "新状态(字符串枚举)") @RequestParam("status") String status) {
    log.info("更新订单状态，订单ID: {}, 新状态: {}", orderId, status);
    return orderService.updateOrderStatus(orderId, status);
  }

  /**
   * 批量更新订单状态（商家后台）
   *
   * @param orderIds 订单ID列表
   * @param status 新状态
   * @return 更新结果
   */
  @PutMapping("/status/batch")
  @Operation(summary = "批量更新订单状态", description = "批量更新订单状态")
  @SysLog("批量更新订单状态")
  @HasPermission("merchant_order_update")
  public R<Boolean> batchUpdateOrderStatus(
      @Parameter(description = "订单ID列表") @RequestBody List<Long> orderIds,
      @Parameter(description = "新状态(字符串枚举)") @RequestParam("status") String status) {
    log.info("批量更新订单状态，订单数量: {}, 新状态: {}", orderIds.size(), status);
    return orderService.batchUpdateOrderStatus(orderIds, status);
  }

  /** 本地配送开始（商家后台） */
  @PostMapping("/delivery/local/start")
  @Operation(summary = "本地配送开始", description = "记录配送员信息并置为配送中")
  @SysLog("本地配送开始")
  @HasPermission("merchant_order_update")
  public R<Boolean> startLocalDelivery(@Valid @RequestBody OrderLocalDeliveryStartDTO startDTO) {
    log.info("本地配送开始请求: {}", startDTO);
    return orderService.startLocalDelivery(startDTO);
  }

  /** 本地配送完成（商家后台） */
  @PostMapping("/delivery/local/complete")
  @Operation(summary = "本地配送完成", description = "置为已送达并尝试完成订单")
  @SysLog("本地配送完成")
  @HasPermission("merchant_order_update")
  public R<Boolean> completeLocalDelivery(
      @Valid @RequestBody OrderLocalDeliveryCompleteDTO completeDTO) {
    log.info("本地配送完成请求: {}", completeDTO);
    return orderService.completeLocalDelivery(completeDTO);
  }

  /** 商家更新订单收货地址 */
  @PutMapping("/address/update")
  @Operation(summary = "商家更新订单收货地址", description = "商家更新订单收货地址（仅支付前允许）")
  @SysLog("商家更新订单收货地址")
  @HasPermission("merchant_order_update")
  public R<Boolean> merchantUpdateOrderAddress(
      @Valid @RequestBody OrderAddressUpdateDTO addressUpdateDTO) {
    log.info("商家更新订单收货地址请求: {}", addressUpdateDTO);
    return orderService.merchantUpdateOrderAddress(addressUpdateDTO);
  }
}

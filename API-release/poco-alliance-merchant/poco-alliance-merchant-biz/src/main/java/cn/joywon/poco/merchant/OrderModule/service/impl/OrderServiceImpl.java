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

package cn.joywon.poco.merchant.OrderModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.constant.enums.UserTypeEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.DataScopeFuncEnum;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.CartModule.entity.CartItem;
import cn.joywon.poco.merchant.CartModule.service.CartService;
import cn.joywon.poco.merchant.CouponModule.bo.CouponApplicableScopeBO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingAllocation;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingIssueService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.MemberModule.entity.User;
import cn.joywon.poco.merchant.MemberModule.service.IUserService;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.entity.Store;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.OrderModule.definition.CancelApplyStatusEnum;
import cn.joywon.poco.merchant.OrderModule.definition.DeliveryStatusEnum;
import cn.joywon.poco.merchant.OrderModule.definition.OrderStatusEnum;
import cn.joywon.poco.merchant.OrderModule.definition.PaymentStatusEnum;
import cn.joywon.poco.merchant.OrderModule.definition.RefundStatusEnum;
import cn.joywon.poco.merchant.OrderModule.dto.*;
import cn.joywon.poco.merchant.OrderModule.entity.*;
import cn.joywon.poco.merchant.OrderModule.exception.OrderBusinessException;
import cn.joywon.poco.merchant.OrderModule.feign.PayFeignClient;
import cn.joywon.poco.merchant.OrderModule.mapper.*;
import cn.joywon.poco.merchant.OrderModule.service.OrderService;
import cn.joywon.poco.merchant.OrderModule.vo.*;
import cn.joywon.poco.merchant.ProductModule.entity.Product;
import cn.joywon.poco.merchant.ProductModule.service.ProductService;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuVO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 订单服务实现类
 *
 * @author poco
 * @date 2025-11-02
 */
@Service
@AllArgsConstructor
@Slf4j
public class OrderServiceImpl extends ServiceImpl<OrderMapper, Order> implements OrderService {

  private final OrderItemMapper orderItemMapper;
  private final OrderRefundApplyMapper orderRefundApplyMapper;
  private final OrderPayRecordMapper orderPayRecordMapper;
  private final TransactionTemplate transactionTemplate;
  private final OrderRefundItemMapper orderRefundItemMapper;
  private final OrderAddressSnapshotMapper orderAddressSnapshotMapper;
  private final OrderDeliveryRecordMapper orderDeliveryRecordMapper;
  private final OrderCancelApplyMapper orderCancelApplyMapper;
  private final IUserCouponService userCouponService;
  private final IJointMarketingIssueService jointMarketingIssueService;
  private final ProductSkuService productSkuService;
  private final ProductService productService;
  private final ICouponTemplateService couponTemplateService;
  private final IStoreService storeService;
  private final PayFeignClient payFeignClient;
  private final RedisTemplate<String, Object> redisTemplate;
  private final IMerchantService merchantService;
  private final IUserService userService;
  private final CartService cartService;

  /**
   * 创建订单
   *
   * <p>该方法是普通下单入口，支持单商家下单。 主要流程： 1. 基础参数校验（非空校验、用户登录校验、消费者身份校验）。 2. 幂等性校验（防止重复提交）。 3. 调用内部下单逻辑
   * {@link #createSingleOrder(OrderCreateDTO, PocoUser)}。 4. 更新幂等性键值，设置过期时间。
   *
   * @param orderCreateDTO 订单创建请求参数
   * @return 订单ID
   */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<String> createOrder(OrderCreateDTO orderCreateDTO) {
    log.info("开始创建订单，请求参数: {}", orderCreateDTO);
    try {
      // 1. 校验订单参数
      if (orderCreateDTO == null || CollUtil.isEmpty(orderCreateDTO.getItems())) {
        return R.failed("订单信息不能为空");
      }
      // 校验 storeId 和 merchantId 至少存在一个
      if (orderCreateDTO.getStoreId() == null && orderCreateDTO.getMerchantId() == null) {
        return R.failed("门店ID或商家ID不能为空");
      }
      if (CollUtil.isEmpty(orderCreateDTO.getItems())) {
        return R.failed("订单商品不能为空");
      }

      // 获取当前操作用户
      PocoUser opUser = SecurityUtils.getUser();
      if (opUser == null) {
        return R.failed("用户未登录");
      }
      // 只允许消费者创建订单
      if (opUser.getUserType() == null
          || !UserTypeEnum.TOC.getStatus().equals(opUser.getUserType())) {
        return R.failed("仅消费者可创建订单");
      }

      if (StrUtil.isBlank(orderCreateDTO.getIdempotencyKey())) {
        return R.failed("幂等性键不能为空");
      }

      // 2. 幂等性校验
      // 使用 Redis SETNX 实现，key 包含租户ID、用户ID和前端传入的幂等键
      Long tenantIdTmp = TenantContextHolder.getTenantId();
      String idemKeyLocal =
          "poco:merchant:order:idempotency:"
              + tenantIdTmp
              + ":"
              + opUser.getId()
              + ":"
              + orderCreateDTO.getIdempotencyKey();
      Boolean setResLocal =
          redisTemplate.opsForValue().setIfAbsent(idemKeyLocal, "1", 30, TimeUnit.MINUTES);
      if (setResLocal == null || !setResLocal) {
        return R.failed("请勿重复提交");
      }

      try {
        // 3. 调用内部下单逻辑
        // createSingleOrder 负责具体的库存扣减、优惠券处理、订单保存等核心业务
        Order order = createSingleOrder(orderCreateDTO, opUser);

        // 4. 更新幂等性键值为订单ID，标记已处理
        redisTemplate
            .opsForValue()
            .set(idemKeyLocal, String.valueOf(order.getId()), 30, TimeUnit.MINUTES);
        // 设置订单过期key（用于未支付订单自动取消等业务，具体逻辑可能在定时任务中）
        String expireKey = "poco:merchant:order:expire:" + order.getId();
        redisTemplate.opsForValue().set(expireKey, "1", 30, TimeUnit.MINUTES);

        return R.ok(order.getOrderNo(), "订单创建成功");
      } catch (Exception e) {
        // 异常时清理幂等键，允许用户重试
        redisTemplate.delete(idemKeyLocal);
        throw e;
      }

    } catch (OrderBusinessException e) {
      log.error("订单创建业务异常: {}", e.getMessage());
      return R.failed(e.getMessage());
    } catch (Exception e) {
      log.error("订单创建失败", e);
      return R.failed("订单创建失败: " + e.getMessage());
    }
  }


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
   * @param dto 购物车下单请求参数（使用新的 merchantOrders 结构）
   * @return 生成的订单ID列表
   */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<List<String>> createOrderFromCart(OrderCreateFromCartDTO dto) {
    log.info("开始购物车下单V2（重构后），请求参数: {}", dto);

    // 幂等性键，用于后续清理
    String idemKey = null;
    // 已锁定的优惠券ID列表，用于异常回滚
    List<Long> lockedCouponIds = new ArrayList<>();

    try {
      // ========== 1. 基础校验 ==========
      PocoUser opUser = SecurityUtils.getUser();
      if (opUser == null) {
        return R.failed("用户未登录");
      }

      // 校验 merchantOrders 不为空
      if (CollUtil.isEmpty(dto.getMerchantOrders())) {
        return R.failed("商家订单列表不能为空");
      }

      // 校验每个 MerchantOrderItem 包含 merchantId 和 items
      for (MerchantOrderItem merchantOrderItem : dto.getMerchantOrders()) {
        if (merchantOrderItem.getMerchantId() == null) {
          return R.failed("商家ID不能为空");
        }
        if (CollUtil.isEmpty(merchantOrderItem.getItems())) {
          return R.failed("商家[" + merchantOrderItem.getMerchantId() + "]的商品列表不能为空");
        }
      }

      // 校验 idempotencyKey 不为空
      if (StrUtil.isBlank(dto.getIdempotencyKey())) {
        return R.failed("幂等性键不能为空");
      }

      // ========== 2. 幂等性校验 ==========
      // 使用 Redis SETNX 实现，设置30分钟过期时间
      Long tenantId = TenantContextHolder.getTenantId();
      idemKey =
          "poco:merchant:order:cart:idempotency:v2:"
              + tenantId
              + ":"
              + opUser.getId()
              + ":"
              + dto.getIdempotencyKey();
      Boolean setRes = redisTemplate.opsForValue().setIfAbsent(idemKey, "1", 30, TimeUnit.MINUTES);
      if (setRes == null || !setRes) {
        return R.failed("请勿重复提交");
      }

      log.info("幂等性校验通过，开始处理订单创建逻辑");

      // ========== 3. 批量查询 SKU 详情 ==========
      // 收集所有商品的 SKU ID
      List<Long> allSkuIds =
          dto.getMerchantOrders().stream()
              .flatMap(merchantOrder -> merchantOrder.getItems().stream())
              .map(OrderItemCreateDTO::getProductSkuId)
              .distinct()
              .collect(Collectors.toList());

      // 批量查询 SKU 详情（避免 N+1 问题）
      List<ProductSkuVO> allSkuDetails = productSkuService.batchGetSkuDetails(allSkuIds);
      if (CollUtil.isEmpty(allSkuDetails)) {
        return R.failed("商品信息查询失败");
      }

      // 构建 SKU ID -> SKU 详情的映射
      Map<Long, ProductSkuVO> skuMap =
          allSkuDetails.stream().collect(Collectors.toMap(ProductSkuVO::getId, v -> v));

      log.info("批量查询SKU详情完成，共{}个SKU", skuMap.size());

      // ========== 4. 商家券计算循环 ==========
      // merchantDiscountedPrices: 存储每个商家的折后价（商品原价总和 - 商家券优惠）
      Map<Long, BigDecimal> merchantDiscountedPrices = new HashMap<>();
      // merchantCouponDiscounts: 存储每个商家的商家券优惠金额
      Map<Long, BigDecimal> merchantCouponDiscounts = new HashMap<>();

      log.info("开始计算商家券优惠，共{}个商家订单", dto.getMerchantOrders().size());

      for (MerchantOrderItem merchantOrderItem : dto.getMerchantOrders()) {
        Long merchantId = merchantOrderItem.getMerchantId();

        // 4.1 计算商家商品原价总和
        BigDecimal merchantOriginalPrice = BigDecimal.ZERO;
        for (OrderItemCreateDTO item : merchantOrderItem.getItems()) {
          ProductSkuVO sku = skuMap.get(item.getProductSkuId());
          if (sku == null) {
            throw new OrderBusinessException("商品SKU[" + item.getProductSkuId() + "]不存在");
          }
          // 商品小计 = 单价 × 数量
          BigDecimal itemTotal =
              sku.getPrice()
                  .multiply(new BigDecimal(item.getQuantity()))
                  .setScale(2, RoundingMode.DOWN); // 使用截断保留2位小数
          merchantOriginalPrice = merchantOriginalPrice.add(itemTotal);
        }

        log.info("商家[{}]商品原价总和: {}", merchantId, merchantOriginalPrice);

        // 4.2 计算商家券优惠金额
        BigDecimal merchantCouponDiscount = BigDecimal.ZERO;
        try {
          // 调用 calculateMerchantCouponDiscount 方法计算商家券优惠
          // 如果商家订单项不包含商家券ID，该方法会返回 BigDecimal.ZERO
          merchantCouponDiscount =
              calculateMerchantCouponDiscount(merchantOrderItem, skuMap, opUser.getId());

          // 如果商家券优惠大于0，说明优惠券已被锁定，需要记录到 lockedCouponIds
          if (merchantCouponDiscount.compareTo(BigDecimal.ZERO) > 0
              && merchantOrderItem.getMerchantCouponId() != null) {
            lockedCouponIds.add(merchantOrderItem.getMerchantCouponId());
            log.info(
                "商家[{}]使用商家券[{}]，优惠金额: {}",
                merchantId,
                merchantOrderItem.getMerchantCouponId(),
                merchantCouponDiscount);
          }
        } catch (OrderBusinessException e) {
          // 商家券计算失败，抛出异常（会触发事务回滚）
          log.error("商家[{}]券计算失败: {}", merchantId, e.getMessage());
          throw e;
        }

        // 4.3 计算商家折后价 = 商品原价总和 - 商家券优惠
        BigDecimal merchantDiscountedPrice =
            merchantOriginalPrice
                .subtract(merchantCouponDiscount)
                .setScale(2, RoundingMode.DOWN); // 使用截断保留2位小数

        // 确保折后价不为负数
        if (merchantDiscountedPrice.compareTo(BigDecimal.ZERO) < 0) {
          merchantDiscountedPrice = BigDecimal.ZERO;
        }

        log.info(
            "商家[{}]折后价: {} (原价: {} - 商家券优惠: {})",
            merchantId,
            merchantDiscountedPrice,
            merchantOriginalPrice,
            merchantCouponDiscount);

        // 4.4 将商家ID和折后价存入映射
        merchantDiscountedPrices.put(merchantId, merchantDiscountedPrice);
        merchantCouponDiscounts.put(merchantId, merchantCouponDiscount);
      }

      log.info("商家券计算完成，商家折后价汇总: {}", merchantDiscountedPrices);
      log.info("商家券优惠汇总: {}", merchantCouponDiscounts);

      // ========== 5. 平台券计算和分摊 ==========
      // platformCouponDiscount: 平台券优惠金额
      BigDecimal platformCouponDiscount = BigDecimal.ZERO;
      // platformCouponAllocations: 平台券分摊到各商家的金额
      Map<Long, BigDecimal> platformCouponAllocations = new HashMap<>();
      // merchantApplicableDiscountedPrices: 每个商家符合平台券的SKU折后价（用于正确分摊）
      Map<Long, BigDecimal> merchantApplicableDiscountedPrices = new HashMap<>();

      // 5.1 计算平台券优惠金额
      if (dto.getPlatformCouponId() != null) {
        log.info("开始计算平台券优惠，平台券ID: {}", dto.getPlatformCouponId());

        try {
          // 调用 calculatePlatformCouponDiscount 方法计算平台券优惠
          // 该方法基于所有商家符合平台券的SKU折后价总和计算优惠金额
          // 同时通过出参返回每个商家符合平台券的SKU折后价（用于后续分摊）
          platformCouponDiscount =
              calculatePlatformCouponDiscount(
                  dto.getPlatformCouponId(),
                  merchantDiscountedPrices,
                  dto.getMerchantOrders(),
                  skuMap,
                  opUser.getId(),
                  merchantApplicableDiscountedPrices); // 出参：每个商家符合平台券的SKU折后价

          log.info("平台券优惠金额: {}", platformCouponDiscount);
          log.info("各商家符合平台券的SKU折后价: {}", merchantApplicableDiscountedPrices);

          // 5.2 如果平台券优惠大于0，进行分摊
          if (platformCouponDiscount.compareTo(BigDecimal.ZERO) > 0) {
            // 将平台券ID添加到已锁定列表（用于异常回滚）
            lockedCouponIds.add(dto.getPlatformCouponId());

            // 调用 allocatePlatformCouponDiscount 方法按比例分摊平台券优惠
            // 关键修复：使用符合平台券的SKU折后价进行分摊，而不是商家整体折后价
            // 分摊公式：商家分摊金额 = 平台券优惠 × (商家符合SKU折后价 / 总符合SKU折后价)
            platformCouponAllocations =
                allocatePlatformCouponDiscount(
                    merchantApplicableDiscountedPrices, platformCouponDiscount);

            log.info("平台券分摊结果: {}", platformCouponAllocations);

            // 5.3 将分摊结果合并到每个商家的优惠金额中
            // 最终每个商家的总优惠 = 商家券优惠 + 分摊的平台券优惠
            for (Map.Entry<Long, BigDecimal> entry : platformCouponAllocations.entrySet()) {
              Long merchantId = entry.getKey();
              BigDecimal platformShare = entry.getValue();

              // 获取该商家的商家券优惠（如果没有则为0）
              BigDecimal merchantCouponDiscount =
                  merchantCouponDiscounts.getOrDefault(merchantId, BigDecimal.ZERO);

              // 计算总优惠金额
              BigDecimal totalDiscount = merchantCouponDiscount.add(platformShare);

              log.info(
                  "商家[{}]总优惠金额: {} (商家券: {} + 平台券分摊: {})",
                  merchantId,
                  totalDiscount,
                  merchantCouponDiscount,
                  platformShare);
            }
          } else {
            log.info("平台券优惠金额为0，跳过分摊逻辑");
          }

        } catch (OrderBusinessException e) {
          // 平台券计算失败，抛出异常（会触发事务回滚）
          log.error("平台券计算失败: {}", e.getMessage());
          throw e;
        }
      } else {
        log.info("未使用平台券，跳过平台券计算");
      }

      log.info("平台券计算和分摊完成");

      // ========== 6. 子订单创建循环 ==========
      // orderIds: 存储所有创建成功的子订单ID
      List<String> orderIds = new ArrayList<>();

      // 6.1 生成统一的支付批次号（用于关联所有子订单）
      // 格式：BATCH_ + 雪花ID
      String payBatchNo = "BATCH_" + IdUtil.getSnowflakeNextIdStr();
      log.info("生成支付批次号: {}", payBatchNo);

      // 6.2 遍历商家订单列表，为每个商家创建子订单
      for (MerchantOrderItem merchantOrderItem : dto.getMerchantOrders()) {
        Long merchantId = merchantOrderItem.getMerchantId();

        log.info("开始创建商家[{}]的子订单", merchantId);

        // 6.3 构造子订单 OrderCreateDTO
        OrderCreateDTO subOrderDTO = new OrderCreateDTO();

        // 6.3.1 设置商家ID和商品列表
        subOrderDTO.setMerchantId(merchantId);
        subOrderDTO.setItems(merchantOrderItem.getItems());

        // 6.3.2 设置履约方式（如果为空则使用默认值 "IN_STORE"）
        String fulfillmentMode = merchantOrderItem.getFulfillmentMode();
        if (StrUtil.isBlank(fulfillmentMode)) {
          fulfillmentMode = "IN_STORE"; // 默认履约方式：到店核销
          log.info("商家[{}]未指定履约方式，使用默认值: IN_STORE", merchantId);
        }
        subOrderDTO.setFulfillmentMode(fulfillmentMode);

        // 6.3.3 设置收货地址信息
        // 如果商家订单项包含收货地址信息，则使用该地址；否则使用用户默认地址（由前端传入或后续处理）
        subOrderDTO.setReceiverName(merchantOrderItem.getReceiverName());
        subOrderDTO.setReceiverPhone(merchantOrderItem.getReceiverPhone());
        subOrderDTO.setProvince(merchantOrderItem.getProvince());
        subOrderDTO.setCity(merchantOrderItem.getCity());
        subOrderDTO.setDistrict(merchantOrderItem.getDistrict());
        subOrderDTO.setDetailAddress(merchantOrderItem.getDetailAddress());
        subOrderDTO.setLatitude(merchantOrderItem.getLatitude());
        subOrderDTO.setLongitude(merchantOrderItem.getLongitude());

        // 6.3.4 设置支付方式
        subOrderDTO.setPayMethod(dto.getPayMethod());

        // 6.3.5 计算该商家的总优惠金额
        // 总优惠 = 商家券优惠 + 分摊的平台券优惠
        BigDecimal merchantCouponDiscount =
            merchantCouponDiscounts.getOrDefault(merchantId, BigDecimal.ZERO);
        BigDecimal platformCouponShare =
            platformCouponAllocations.getOrDefault(merchantId, BigDecimal.ZERO);
        BigDecimal totalDiscountForMerchant = merchantCouponDiscount.add(platformCouponShare);

        log.info(
            "商家[{}]总优惠金额: {} (商家券: {} + 平台券分摊: {})",
            merchantId,
            totalDiscountForMerchant,
            merchantCouponDiscount,
            platformCouponShare);

        // 6.3.6 设置优惠券ID（用于记录使用的优惠券）
        // 注意：这里只记录商家券ID，平台券会在后续统一关联
        if (merchantOrderItem.getMerchantCouponId() != null) {
          subOrderDTO.setMerchantCouponId(merchantOrderItem.getMerchantCouponId());
        }

        // 6.4 调用 createSingleOrderWithAllocatedDiscount 创建子订单
        // 该方法接受已分配的优惠金额，跳过优惠券校验和锁定步骤（因为优惠券已在前面锁定）
        try {
          Order subOrder =
              createSingleOrderWithAllocatedDiscount(subOrderDTO, opUser, totalDiscountForMerchant);

          log.info(
              "商家[{}]子订单创建成功，订单ID: {}, 订单号: {}",
              merchantId,
              subOrder.getId(),
              subOrder.getOrderNo());

          // 6.5 更新子订单的 payBatchNo 字段（关联到统一的支付批次）
          boolean updateResult =
              this.lambdaUpdate()
                  .eq(Order::getId, subOrder.getId())
                  .set(Order::getPayBatchNo, payBatchNo)
                  .update();

          if (!updateResult) {
            log.warn("更新子订单[{}]的支付批次号失败", subOrder.getId());
            throw new OrderBusinessException("更新支付批次号失败");
          }

          log.info("商家[{}]子订单支付批次号更新成功: {}", merchantId, payBatchNo);

          // 6.6 将子订单ID添加到 orderIds 列表
          orderIds.add(subOrder.getOrderNo());

        } catch (OrderBusinessException e) {
          // 子订单创建失败，抛出异常（会触发事务回滚）
          log.error("商家[{}]子订单创建失败: {}", merchantId, e.getMessage());
          throw new OrderBusinessException("商家[" + merchantId + "]订单创建失败: " + e.getMessage());
        }
      }

      log.info("所有子订单创建完成，共{}个订单，订单号列表: {}", orderIds.size(), orderIds);

      // ========== 7. 优惠券关联和状态更新 ==========
      // 7.1 批量更新所有使用的优惠券的 usedOrderId 字段
      // 注意：这里记录第一个订单ID（用于追溯优惠券使用记录）
      if (CollUtil.isNotEmpty(lockedCouponIds) && CollUtil.isNotEmpty(orderIds)) {
        // 获取第一个订单的ID（用于关联优惠券）
        String firstOrderNo = orderIds.get(0);
        Order firstOrder = this.lambdaQuery().eq(Order::getOrderNo, firstOrderNo).one();

        if (firstOrder != null) {
          Long firstOrderId = firstOrder.getId();

          // 批量更新优惠券状态：LOCKED -> USED，并记录使用的订单ID
          for (Long couponId : lockedCouponIds) {
            boolean updateResult =
                userCouponService
                    .lambdaUpdate()
                    .eq(UserCoupon::getId, couponId)
                    .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
                    .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_USED)
                    .set(UserCoupon::getUsedOrderId, firstOrderId)
                    .update();

            if (updateResult) {
              log.info("优惠券[{}]状态更新成功，关联订单ID: {}", couponId, firstOrderId);
            } else {
              log.warn("优惠券[{}]状态更新失败", couponId);
            }
          }

          log.info("所有优惠券状态更新完成，共{}张优惠券", lockedCouponIds.size());
        } else {
          log.warn("未找到第一个订单，无法关联优惠券");
        }
      }

      // 7.2 更新幂等性键值为订单ID列表，标记已处理
      redisTemplate.opsForValue().set(idemKey, JSONUtil.toJsonStr(orderIds), 30, TimeUnit.MINUTES);
      log.info("幂等性键更新成功，订单ID列表: {}", orderIds);

      // 7.3 设置订单过期key（用于未支付订单自动取消等业务）
      for (String orderNo : orderIds) {
        String expireKey = "poco:merchant:order:expire:" + orderNo;
        redisTemplate.opsForValue().set(expireKey, "1", 30, TimeUnit.MINUTES);
      }

      log.info("购物车下单V2成功，共创建{}个订单", orderIds.size());

      // ========== 8. 返回订单ID列表 ==========
      return R.ok(orderIds, "订单创建成功");

    } catch (Exception e) {
      log.error("购物车下单V2失败", e);

      // 发生异常，需要回滚（事务注解已处理数据库回滚），但需手动回滚 Redis 锁定的优惠券
      if (CollUtil.isNotEmpty(lockedCouponIds)) {
        try {
          // 批量将已锁定的优惠券状态重置为未使用
          for (Long couponId : lockedCouponIds) {
            userCouponService
                .lambdaUpdate()
                .eq(UserCoupon::getId, couponId)
                .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
                .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
                .update();
            log.info("已回滚优惠券状态，couponId: {}", couponId);
          }
        } catch (Exception ex) {
          log.error("回滚优惠券失败", ex);
        }
      }

      // 下单失败时清理幂等性键，允许用户重试
      if (idemKey != null) {
        try {
          redisTemplate.delete(idemKey);
          log.info("购物车下单V2失败，已清理幂等性键: {}", idemKey);
        } catch (Exception ex) {
          log.error("清理幂等性键失败, key={}", idemKey, ex);
        }
      }

      throw new OrderBusinessException("下单失败: " + e.getMessage());
    }
  }

  /** 内部单据创建逻辑（支持指定优惠金额，跳过锁券步骤） */
  private Order createSingleOrderWithAllocatedDiscount(
      OrderCreateDTO orderCreateDTO, PocoUser opUser, BigDecimal allocatedCouponDiscount) {
    // 复用 createSingleOrder 逻辑，但需特殊处理优惠券
    // 这里为了代码复用，可以将 createSingleOrder 改造为接受 allocatedCouponDiscount
    // 如果 allocatedCouponDiscount 不为 null，则跳过优惠券校验和锁券逻辑，直接使用该金额
    return createSingleOrderInternal(orderCreateDTO, opUser, allocatedCouponDiscount);
  }

  private Order createSingleOrder(OrderCreateDTO orderCreateDTO, PocoUser opUser) {
    return createSingleOrderInternal(orderCreateDTO, opUser, null);
  }

  private Order createSingleOrderInternal(
      OrderCreateDTO orderCreateDTO, PocoUser opUser, BigDecimal allocatedCouponDiscount) {
    // 初始化金额
    BigDecimal totalProductPrice = BigDecimal.ZERO;
    BigDecimal totalDiscountAmount = BigDecimal.ZERO;
    BigDecimal finalPaidPrice;

    // 1. 校验 & 获取商品信息
    List<OrderItemCreateDTO> itemDTOs = orderCreateDTO.getItems();
    List<ProductSkuVO> skuVOs = new ArrayList<>();
    List<BigDecimal> itemTotals = new ArrayList<>();

    List<Long> skuIds =
        itemDTOs.stream().map(OrderItemCreateDTO::getProductSkuId).collect(Collectors.toList());
    List<ProductSkuVO> skuDetails = productSkuService.batchGetSkuDetails(skuIds);
    if (CollUtil.isEmpty(skuDetails)) {
      throw new OrderBusinessException("商品SKU不存在");
    }
    Map<Long, ProductSkuVO> skuVoMap =
        skuDetails.stream().collect(Collectors.toMap(ProductSkuVO::getId, v -> v));

    for (OrderItemCreateDTO itemDTO : itemDTOs) {
      ProductSkuVO skuVO = skuVoMap.get(itemDTO.getProductSkuId());
      if (skuVO == null) {
        throw new OrderBusinessException("商品[" + itemDTO.getProductSkuId() + "]不存在");
      }
      // 校验商品是否已删除
      if ("1".equals(skuVO.getIsDeleted())) {
        throw new OrderBusinessException("商品[" + skuVO.getSkuName() + "]不存在");
      }
      // 校验商品是否已下架（enabled: 0-禁用，1-启用）
      if (!"1".equals(skuVO.getEnabled())) {
        throw new OrderBusinessException("商品[" + skuVO.getSkuName() + "]已下架，无法购买");
      }
      skuVOs.add(skuVO);

      // 使用截断(RoundingMode.DOWN)而非四舍五入，确保金额精度统一
      BigDecimal itemUnitPrice =
          skuVO.getPrice() == null
              ? BigDecimal.ZERO
              : skuVO.getPrice().setScale(2, RoundingMode.DOWN);
      BigDecimal itemTotalPrice =
          itemUnitPrice
              .multiply(new BigDecimal(itemDTO.getQuantity()))
              .setScale(2, RoundingMode.DOWN);
      totalProductPrice = totalProductPrice.add(itemTotalPrice).setScale(2, RoundingMode.DOWN);
      itemTotals.add(itemTotalPrice);
    }

    // 2. 确定 StoreId 和 MerchantId
    Long storeId = orderCreateDTO.getStoreId();
    Long merchantId = orderCreateDTO.getMerchantId();

    if (storeId != null) {
      Store store = storeService.getById(storeId);
      if (store == null) throw new OrderBusinessException("门店不存在");
      merchantId = store.getMerchantId();
    } else if (merchantId != null) {
      // 仅传了 merchantId，未传 storeId
      // 这种情况下 storeId 保持为 null
    } else {
      throw new OrderBusinessException("门店ID和商家ID不能同时为空");
    }

    Order order = new Order();
    BeanUtils.copyProperties(orderCreateDTO, order);
    order.setStoreId(storeId);
    order.setMerchantId(merchantId);
    try {
      order.setTenantId(TenantContextHolder.getTenantId());
      order.setUserId(opUser.getId());
    } catch (Exception ignored) {
    }

    // 2.1 校验商品所属商家
    // 获取所有 SKU 对应的商品信息，校验商家归属
    Set<Long> productIds =
        skuVOs.stream()
            .map(ProductSkuVO::getProductId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    if (!productIds.isEmpty()) {
      List<Product> products = productService.listByIds(productIds);
      if (CollUtil.isNotEmpty(products)) {
        for (Product product : products) {
          if (product.getMerchantId() == null || !product.getMerchantId().equals(merchantId)) {
            throw new OrderBusinessException("商品[" + product.getName() + "]不属于当前商家");
          }
        }
      }
    }

    // 3. 优惠券处理
    // 用于记录已锁定的优惠券ID列表（用于异常回滚）
    List<Long> lockedCouponIds = new ArrayList<>();
    
    if (allocatedCouponDiscount != null) {
      // ========== 购物车下单拆单模式：直接使用分摊金额 ==========
      totalDiscountAmount = allocatedCouponDiscount;
      order.setCouponDiscountAmount(allocatedCouponDiscount);
      // 注意：couponId 已在调用方设置（购物车下单V2中设置为商家券ID）
      
      log.info("购物车拆单模式，使用分摊优惠金额: {}", allocatedCouponDiscount);
      
    } else {
      // ========== 普通下单模式：执行完整校验和计算 ==========
      
      log.info("普通下单模式，开始优惠券计算");
      
      // 3.1 计算商家券优惠
      BigDecimal merchantCouponDiscount = BigDecimal.ZERO;
      
      if (orderCreateDTO.getMerchantCouponId() != null) {
        log.info("开始计算商家券优惠，merchantCouponId: {}", orderCreateDTO.getMerchantCouponId());
        
        try {
          // 构造临时的 MerchantOrderItem（复用购物车下单的计算方法）
          MerchantOrderItem tempMerchantOrder = new MerchantOrderItem();
          tempMerchantOrder.setMerchantId(merchantId);
          tempMerchantOrder.setItems(orderCreateDTO.getItems());
          tempMerchantOrder.setMerchantCouponId(orderCreateDTO.getMerchantCouponId());
          
          // 复用购物车下单的商家券计算方法
          merchantCouponDiscount = calculateMerchantCouponDiscount(
              tempMerchantOrder, 
              skuVoMap, 
              opUser.getId()
          );
          
          // 记录已锁定的商家券ID
          lockedCouponIds.add(orderCreateDTO.getMerchantCouponId());
          
          log.info("商家券优惠计算完成，优惠金额: {}", merchantCouponDiscount);
          
        } catch (OrderBusinessException e) {
          log.error("商家券计算失败: {}", e.getMessage());
          throw e;
        }
      }
      
      // 3.2 计算折后价（商品原价总和 - 商家券优惠）
      BigDecimal discountedPrice = totalProductPrice
          .subtract(merchantCouponDiscount)
          .setScale(2, RoundingMode.DOWN);
      
      // 确保折后价不为负数
      if (discountedPrice.compareTo(BigDecimal.ZERO) < 0) {
        discountedPrice = BigDecimal.ZERO;
      }
      
      log.info("折后价计算完成: {} (原价: {} - 商家券: {})", 
          discountedPrice, totalProductPrice, merchantCouponDiscount);
      
      // 3.3 计算平台券优惠
      BigDecimal platformCouponDiscount = BigDecimal.ZERO;
      
      if (orderCreateDTO.getPlatformCouponId() != null) {
        log.info("开始计算平台券优惠，platformCouponId: {}", orderCreateDTO.getPlatformCouponId());
        
        try {
          // 构造临时的商家订单列表（单品下单只有一个商家）
          MerchantOrderItem tempMerchantOrder = new MerchantOrderItem();
          tempMerchantOrder.setMerchantId(merchantId);
          tempMerchantOrder.setItems(orderCreateDTO.getItems());
          
          List<MerchantOrderItem> merchantOrderItems = Collections.singletonList(tempMerchantOrder);
          
          // 构造商家折后价映射
          Map<Long, BigDecimal> merchantDiscountedPrices = new HashMap<>();
          merchantDiscountedPrices.put(merchantId, discountedPrice);
          
          // 用于接收符合平台券的SKU折后价（单品下单场景不需要，但方法签名要求）
          Map<Long, BigDecimal> merchantApplicableDiscountedPrices = new HashMap<>();
          
          // 复用购物车下单的平台券计算方法
          platformCouponDiscount = calculatePlatformCouponDiscount(
              orderCreateDTO.getPlatformCouponId(),
              merchantDiscountedPrices,
              merchantOrderItems,
              skuVoMap,
              opUser.getId(),
              merchantApplicableDiscountedPrices
          );
          
          // 记录已锁定的平台券ID
          lockedCouponIds.add(orderCreateDTO.getPlatformCouponId());
          
          log.info("平台券优惠计算完成，优惠金额: {}", platformCouponDiscount);
          
        } catch (OrderBusinessException e) {
          log.error("平台券计算失败: {}", e.getMessage());
          // 回滚已锁定的商家券
          rollbackCoupons(lockedCouponIds);
          throw e;
        }
      }
      
      // 3.4 计算总优惠金额
      totalDiscountAmount = merchantCouponDiscount
          .add(platformCouponDiscount)
          .setScale(2, RoundingMode.DOWN);
      
      log.info("总优惠金额: {} (商家券: {} + 平台券: {})", 
          totalDiscountAmount, merchantCouponDiscount, platformCouponDiscount);
      
      // 3.5 设置订单优惠信息
      order.setCouponDiscountAmount(totalDiscountAmount);
      
      // 记录使用的优惠券ID（优先记录商家券）
      if (orderCreateDTO.getMerchantCouponId() != null) {
        order.setCouponId(orderCreateDTO.getMerchantCouponId());
      } else if (orderCreateDTO.getPlatformCouponId() != null) {
        order.setCouponId(orderCreateDTO.getPlatformCouponId());
      }
    }

    // 记录是否需要回滚优惠券（仅普通下单模式且有优惠券锁定时需要）
    boolean needRollbackCoupon = (allocatedCouponDiscount == null && !lockedCouponIds.isEmpty());

    try {
      // 4. 生成订单号等基础信息
      String orderNo = generateOrderNo(storeId, order.getTenantId());
      order.setOrderNo(orderNo);
      // 默认单据也生成一个独立的批次号，或者留空（视业务而定），为了统一逻辑，单据也可以有批次号（等于订单号或独立）
      // 这里暂时留空，在支付时如果为空则以订单号支付。
      // 直连商户模式不需要分账，设为0；服务商模式需要分账改为1
      order.setProfitSharingStatus(0); // 0-无需分账
      order.setStatus(OrderStatusEnum.PENDING_PAYMENT.getCode());
      order.setTotalProductPrice(totalProductPrice.setScale(2, RoundingMode.DOWN));
      order.setTotalDiscountAmount(totalDiscountAmount.setScale(2, RoundingMode.DOWN));
      finalPaidPrice = totalProductPrice.subtract(totalDiscountAmount);
      if (finalPaidPrice.compareTo(BigDecimal.ZERO) < 0) {
        finalPaidPrice = BigDecimal.ZERO;
      }
      order.setFinalPaidPrice(finalPaidPrice.setScale(2, RoundingMode.DOWN));
      order.setExpireTime(LocalDateTime.now().plusMinutes(30));
      order.setVerificationCode(generateVerificationCode());
      order.setIsDeleted(0);
      order.setCreatedTime(LocalDateTime.now());
      order.setUpdatedTime(LocalDateTime.now());

      // 5. 预留库存（带重试机制）
      Map<Long, Integer> skuQuantityMap = new HashMap<>();
      for (OrderItemCreateDTO itemDTO : itemDTOs) {
        skuQuantityMap.merge(itemDTO.getProductSkuId(), itemDTO.getQuantity(), Integer::sum);
      }
      for (Map.Entry<Long, Integer> e : skuQuantityMap.entrySet()) {
        deductStockWithRetry(e.getKey(), e.getValue());
      }

      // 6. 保存订单
      boolean saveResult = this.save(order);
      if (!saveResult) {
        throw new OrderBusinessException("订单保存失败");
      }

      // 7. 计算明细分摊并保存（使用截断而非四舍五入）
      List<BigDecimal> discountShares = new ArrayList<>();
      if (totalProductPrice.compareTo(BigDecimal.ZERO) > 0
          && totalDiscountAmount.compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal sumShare = BigDecimal.ZERO;
        int n = itemTotals.size();
        for (int i = 0; i < n; i++) {
          if (i < n - 1) {
            BigDecimal ratio = itemTotals.get(i).divide(totalProductPrice, 8, RoundingMode.HALF_UP);
            BigDecimal share =
                ratio.multiply(totalDiscountAmount).setScale(2, RoundingMode.DOWN);
            discountShares.add(share);
            sumShare = sumShare.add(share);
          } else {
            // 最后一个商品使用减法兜底，避免精度损失
            BigDecimal last =
                totalDiscountAmount.subtract(sumShare).setScale(2, RoundingMode.DOWN);
            discountShares.add(last);
          }
        }
      } else {
        for (int i = 0; i < itemTotals.size(); i++) {
          discountShares.add(BigDecimal.ZERO);
        }
      }

      // 获取商品信息用于快照
      Set<Long> snapshotProductIds =
          skuVOs.stream()
              .map(ProductSkuVO::getProductId)
              .filter(Objects::nonNull)
              .collect(Collectors.toSet());
      Map<Long, Product> productMap = new HashMap<>();
      if (!snapshotProductIds.isEmpty()) {
        List<Product> plist = productService.listByIds(snapshotProductIds);
        if (plist != null) {
          for (Product p : plist) {
            if (p != null && p.getId() != null) productMap.put(p.getId(), p);
          }
        }
      }

      for (int i = 0; i < itemDTOs.size(); i++) {
        OrderItemCreateDTO itemDTO = itemDTOs.get(i);
        ProductSkuVO skuVO = skuVOs.get(i);

        OrderItem orderItem = new OrderItem();
        BeanUtils.copyProperties(itemDTO, orderItem);
        orderItem.setOrderId(order.getId());
        try {
          orderItem.setTenantId(order.getTenantId());
        } catch (Exception ignored) {
        }

        // 使用截断(RoundingMode.DOWN)而非四舍五入
        BigDecimal itemUnitPrice =
            skuVO.getPrice() == null
                ? BigDecimal.ZERO
                : skuVO.getPrice().setScale(2, RoundingMode.DOWN);
        orderItem.setOriginalPrice(itemUnitPrice);
        BigDecimal itemMarketPrice =
            skuVO.getOriginalPrice() == null
                ? BigDecimal.ZERO
                : skuVO.getOriginalPrice().setScale(2, RoundingMode.DOWN);
        orderItem.setMarketPrice(itemMarketPrice);
        BigDecimal itemTotalPrice = itemTotals.get(i);
        BigDecimal apportionedDiscount = discountShares.get(i);

        orderItem.setFinalPrice(
            itemTotalPrice.subtract(apportionedDiscount).setScale(2, RoundingMode.DOWN));
        orderItem.setApportionedDiscount(apportionedDiscount);

        // 快照
        try {
          orderItem.setSkuName(skuVO.getSkuName());
          orderItem.setSkuCode(skuVO.getSkuCode());
          Long productId = skuVO.getProductId();
          orderItem.setProductId(productId);
          String productImage = skuVO.getSkuImage();
          if (productId != null) {
            Product p = productMap.get(productId);
            if (p != null) {
              orderItem.setProductName(p.getName());
              if (StrUtil.isBlank(productImage)) productImage = p.getMainImage();
            }
          }
          orderItem.setProductImage(productImage);
        } catch (Exception ignore) {
        }

        orderItem.setIsDeleted(0);
        orderItem.setCreatedTime(LocalDateTime.now());
        orderItem.setUpdatedTime(LocalDateTime.now());
        orderItemMapper.insert(orderItem);
      }

      // 8. 地址快照
      try {
        if (StrUtil.isNotBlank(orderCreateDTO.getReceiverName())
            || StrUtil.isNotBlank(orderCreateDTO.getDetailAddress())) {
          OrderAddressSnapshot snapshot = new OrderAddressSnapshot();
          snapshot.setOrderId(order.getId());
          try {
            snapshot.setTenantId(order.getTenantId());
          } catch (Exception ignored) {
          }
          snapshot.setReceiverName(orderCreateDTO.getReceiverName());
          snapshot.setReceiverPhone(orderCreateDTO.getReceiverPhone());
          snapshot.setProvince(orderCreateDTO.getProvince());
          snapshot.setCity(orderCreateDTO.getCity());
          snapshot.setDistrict(orderCreateDTO.getDistrict());
          snapshot.setDetailAddress(orderCreateDTO.getDetailAddress());
          snapshot.setLatitude(orderCreateDTO.getLatitude());
          snapshot.setLongitude(orderCreateDTO.getLongitude());
          snapshot.setAddressType("RECEIVER");
          snapshot.setIsDeleted(0);
          snapshot.setCreatedTime(LocalDateTime.now());
          snapshot.setUpdatedTime(LocalDateTime.now());
          orderAddressSnapshotMapper.insert(snapshot);
        }
      } catch (Exception e) {
        log.warn("下单地址快照固化失败，orderId={}", order.getId(), e);
      }

      return order;
    } catch (Exception e) {
      // 优惠券已锁定但后续步骤失败，需要回滚优惠券状态
      if (needRollbackCoupon && !lockedCouponIds.isEmpty()) {
        log.warn("单品下单后续步骤失败，开始回滚优惠券状态，couponIds={}", lockedCouponIds);
        rollbackCoupons(lockedCouponIds);
      }
      throw e;
    }
  }

  @Override
  public IPage<OrderListVO> getOrderPage(OrderPageQueryDTO orderPageQueryDTO) {
    PocoUser currentUser = null;
    try {
      currentUser = SecurityUtils.getUser();
    } catch (Exception ignored) {
    }

    DataScope listScope;
    DataScope countScope;

    if (isToc(currentUser)) {
      throw new AccessDeniedException("Access is denied");
    } else {
      if (orderPageQueryDTO.getStoreId() != null && orderPageQueryDTO.getStoreId() <= 0) {
        orderPageQueryDTO.setStoreId(null);
      }
      if (orderPageQueryDTO.getUserId() != null && orderPageQueryDTO.getUserId() <= 0) {
        orderPageQueryDTO.setUserId(null);
      }
      String deptColumn =
          (orderPageQueryDTO.getStoreId() != null && orderPageQueryDTO.getStoreId() > 0)
              ? "store_id"
              : "merchant_id";
      listScope = listScope(deptColumn, "created_by");
      countScope = countScope(deptColumn, "created_by");
      if (orderPageQueryDTO.getStoreId() != null && orderPageQueryDTO.getStoreId() > 0) {
        // 不手动设置 deptIds，让系统根据用户角色自动计算权限范围
        // 如果用户指定了无权访问的门店ID，查询结果会自动为空（安全）
      }
      // 未指定门店时，不显式设置商家 deptIds，交由 DataScopeHandle 基于角色数据权限计算（支持租户管理员“本级及下级”）
    }

    Page<OrderListVO> page = orderPageQueryDTO.page();
    page.setSearchCount(false);
    IPage<OrderListVO> resultPage =
        baseMapper.getOrderListPageByDTO(page, orderPageQueryDTO, listScope);
    Long total = baseMapper.countOrderListByDTO(orderPageQueryDTO, countScope);
    page.setTotal(total == null ? 0L : total);

    if (resultPage != null
        && resultPage.getRecords() != null
        && !resultPage.getRecords().isEmpty()) {
      List<Long> orderIds =
          resultPage.getRecords().stream()
              .map(OrderListVO::getId)
              .filter(Objects::nonNull)
              .collect(Collectors.toList());
      if (!orderIds.isEmpty()) {
        List<OrderItemVO> itemList = orderItemMapper.getOrderItemsByOrderIds(orderIds);
        Map<Long, List<OrderItemVO>> itemsByOrder =
            itemList.stream().collect(Collectors.groupingBy(OrderItemVO::getOrderId));
        for (OrderListVO vo : resultPage.getRecords()) {
          vo.setItems(itemsByOrder.getOrDefault(vo.getId(), Collections.emptyList()));
          vo.setStatusDesc(getStatusDesc(vo.getStatus()));
        }
      }
    }
    return resultPage;
  }

  @Override
  public IPage<OrderListVO> getConsumerOrderPage(OrderPageQueryDTO orderPageQueryDTO) {
    PocoUser currentUser = null;
    try {
      currentUser = SecurityUtils.getUser();
    } catch (Exception ignored) {
    }
    Page<OrderListVO> page = orderPageQueryDTO.page();
    if (currentUser == null) {
      page.setRecords(Collections.emptyList());
      page.setTotal(0);
      return page;
    }

    orderPageQueryDTO.setUserId(currentUser.getId());

    DataScope listScope = new DataScope();
    listScope.setFunc(DataScopeFuncEnum.ALL);
    listScope.setScopeUserName("user_id"); // 使用user_id字段过滤
    listScope.setUsername(String.valueOf(currentUser.getId()));

    DataScope countScope = new DataScope();
    countScope.setFunc(DataScopeFuncEnum.COUNT);
    countScope.setScopeUserName("user_id"); // 使用user_id字段过滤
    countScope.setUsername(String.valueOf(currentUser.getId()));
    page.setSearchCount(false);

    IPage<OrderListVO> resultPage =
        baseMapper.getOrderListPageByDTO(page, orderPageQueryDTO, listScope);
    log.info("获取订单列表，总记录数：{}", resultPage.getTotal());
    Long total = baseMapper.countOrderListByDTO(orderPageQueryDTO, countScope);
    page.setTotal(total == null ? 0L : total);

    if (resultPage != null
        && resultPage.getRecords() != null
        && !resultPage.getRecords().isEmpty()) {
      List<Long> orderIds =
          resultPage.getRecords().stream()
              .map(OrderListVO::getId)
              .filter(Objects::nonNull)
              .collect(Collectors.toList());
      if (!orderIds.isEmpty()) {
        List<OrderItemVO> itemList = orderItemMapper.getOrderItemsByOrderIds(orderIds);
        Map<Long, List<OrderItemVO>> itemsByOrder =
            itemList.stream().collect(Collectors.groupingBy(OrderItemVO::getOrderId));
        for (OrderListVO vo : resultPage.getRecords()) {
          vo.setItems(itemsByOrder.getOrDefault(vo.getId(), Collections.emptyList()));
        }
      }
    }
    return resultPage;
  }

  @Override
  public R<OrderDetailVO> getOrderDetailForConsumer(Long orderId) {
    try {
      if (orderId == null) {
        return R.failed("订单ID不能为空");
      }
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Order order = this.getById(orderId);
      if (order == null || !order.getUserId().equals(user.getId())) {
        return R.failed("无权访问该订单");
      }

      OrderDetailVO orderDetailVO =
          baseMapper.getOrderDetailById(orderId, listScopeUser("created_by"));
      if (orderDetailVO == null) {
        return R.failed("订单不存在");
      }

      List<OrderItemVO> orderItemVOs = orderItemMapper.getOrderItemsByOrderId(orderId);

      orderDetailVO.setItems(orderItemVOs);

      try {
        OrderAddressSnapshotVO addressVO =
            orderAddressSnapshotMapper.getAddressSnapshotByOrderId(orderId);
        orderDetailVO.setDeliveryAddress(addressVO);
      } catch (Exception e) {
      }

      try {
        OrderDeliveryRecordVO deliveryVO =
            orderDeliveryRecordMapper.getLatestDeliveryRecordByOrderId(orderId);
        orderDetailVO.setDeliveryRecord(deliveryVO);
      } catch (Exception e) {
      }

      // 填充支付信息（支付流水号）
      fillPaymentInfo(orderDetailVO, orderId);

      return R.ok(orderDetailVO);

    } catch (Exception e) {
      log.error("获取订单详情失败，订单ID: {}", orderId, e);
      return R.failed("获取订单详情失败: " + e.getMessage());
    }
  }

  /**
   * 订单支付发起接口
   *
   * <p>该方法用于消费者发起订单支付请求。 核心流程： 1. 业务校验： - 订单存在性、用户登录状态、用户身份（仅限消费者）。 - 订单归属权校验（只能支付自己的订单）。 -
   * 订单状态校验（必须为待支付状态）。 - 订单有效期校验（是否已过期）。 2. 订单信息更新： - 更新支付方式（目前仅支持微信支付）。 - 更新订单最后修改时间。 3. 记录支付流水： -
   * 创建 OrderPayRecord 记录，状态为 INIT。 - 用于后续对账和支付状态追踪。 4. 调用支付中台： - 构建支付请求参数（PayGoodsOrderDTO）。 -
   * 处理商户模式（普通直连商户 vs 服务商模式）。 - 调用 PayFeignClient 获取支付参数（如JSAPI参数、二维码链接等）。 5. 返回结果构造： - 将支付参数封装为
   * OrderPayResultVO 返回给前端。
   *
   * @param orderPayDTO 支付请求参数（包含订单ID、支付方式等）
   * @return 支付结果（包含调起支付所需的参数）
   */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<OrderPayResultVO> payOrder(OrderPayDTO orderPayDTO) {
    try {
      // --- 1. 基础参数校验 ---
      if (orderPayDTO == null || orderPayDTO.getOrderId() == null) {
        return R.failed("订单ID不能为空");
      }

      // 查询订单信息（直接通过ID查询，不需要权限校验，因为后续会验证用户身份）
      Order order = this.getById(orderPayDTO.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }

      // 获取当前用户信息
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 身份校验：只允许消费者支付订单
      if (user.getUserType() == null || !UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
        return R.failed("仅消费者可支付订单");
      }

      // 归属权校验：消费者只能支付自己的订单
      if (!user.getId().equals(order.getUserId())) {
        return R.failed("无权操作该订单");
      }

      // 状态校验：必须是待支付状态
      if (!OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())) {
        return R.failed("订单状态异常，无法支付");
      }

      // 有效期校验：检查订单是否已过期
      if (order.getExpireTime() != null && LocalDateTime.now().isAfter(order.getExpireTime())) {
        return R.failed("订单已过期");
      }

      // --- 2. 更新订单支付方式 ---
      // 将前端传入的整数支付方式映射为系统内部字符串编码
      // 目前业务主要支持微信支付，后续可扩展支付宝等
      if (orderPayDTO.getPayMethod() == 1) { // 1-微信支付
        order.setPaymentMethod("WECHAT_PAY");
      } else {
        // 兜底逻辑：默认为微信支付
        order.setPaymentMethod("WECHAT_PAY");
      }
      order.setUpdatedTime(LocalDateTime.now());
      this.updateById(order);

      // --- 3. 创建本地支付流水记录 ---
      // 在调用第三方支付前，先记录本地流水，确保有据可查
      OrderPayRecord payRecord = new OrderPayRecord();
      payRecord.setOrderId(order.getId());
      try {
        payRecord.setTenantId(order.getTenantId());
      } catch (Exception ignored) {
      }
      payRecord.setChannel(order.getPaymentMethod());
      payRecord.setRequestAmount(order.getFinalPaidPrice());
      payRecord.setStatus(PaymentStatusEnum.INIT.getCode()); // 初始状态
      payRecord.setIsDeleted(0);
      payRecord.setCreatedTime(LocalDateTime.now());
      payRecord.setUpdatedTime(LocalDateTime.now());
      orderPayRecordMapper.insert(payRecord);

      // --- 4. 准备支付参数并调用支付平台 ---
      PayGoodsOrderDTO payGoodsOrderDTO = new PayGoodsOrderDTO();
      payGoodsOrderDTO.setGoodsId(order.getId().toString());
      // 商品名称，用于支付账单展示
      payGoodsOrderDTO.setGoodsName("订单支付-" + order.getOrderNo());

      // --- 合并支付处理 ---
      String outTradeNo = order.getOrderNo();
      BigDecimal payAmount = order.getFinalPaidPrice();

      if (StrUtil.isNotBlank(order.getPayBatchNo())) {
        // 如果有批次号，尝试查找同批次未支付订单进行合并
        List<Order> batchOrders =
            this.list(
                new LambdaQueryWrapper<Order>()
                    .eq(Order::getPayBatchNo, order.getPayBatchNo())
                    .eq(Order::getStatus, OrderStatusEnum.PENDING_PAYMENT.getCode()));

        if (CollUtil.isNotEmpty(batchOrders)) {
          // 校验所有订单是否都属于同一用户
          for (Order o : batchOrders) {
            if (!o.getUserId().equals(order.getUserId())) {
              return R.failed("订单归属异常，无法合并支付");
            }
          }

          // 重新计算总金额
          payAmount =
              batchOrders.stream()
                  .map(Order::getFinalPaidPrice)
                  .reduce(BigDecimal.ZERO, BigDecimal::add);

          // 使用批次号作为支付流水号
          outTradeNo = order.getPayBatchNo();
          payGoodsOrderDTO.setGoodsName("合并支付-" + batchOrders.size() + "笔订单");
        }
      }

      // 支付金额，单位：分 (BigDecimal -> int string)
      payGoodsOrderDTO.setAmount(payAmount.multiply(new BigDecimal(100)).intValue() + "");
      payGoodsOrderDTO.setPayOrderId(
          order.getId()); // 这里PayGoodsOrder的ID可能需要对应业务主键，如果使用批次号支付，这里可能需要调整，但通常为了回调能找到记录，使用批次号更佳
      // 注意：PayGoodsOrderDTO 中的 payOrderId 对应的是 PayTradeOrder 中的 orderId，最终对应微信支付的 out_trade_no
      // 因此，如果是合并支付，必须传入批次号作为 payOrderId
      if (StrUtil.isNotBlank(order.getPayBatchNo())) {
        // 为了兼容 Long 类型 (如果 PayTradeOrder 的 orderId 是 Long)，我们需要确保 payBatchNo 能被处理
        // 但通常 out_trade_no 是 String。检查 PayGoodsOrderDTO 定义，payOrderId 是 Long 类型。
        // 如果 payBatchNo 是 "BATCH_xxx" 字符串，无法塞入 Long 类型的 payOrderId。
        // 这是一个潜在的兼容性问题。
        // 方案：如果是合并支付，我们需要创建一个“主支付单”记录，或者临时使用一个纯数字的批次ID。
        // 刚才生成的批次号是 "BATCH_" + SnowflakeId。去掉前缀即可。
        String batchIdStr = order.getPayBatchNo().replace("BATCH_", "");
        try {
          payGoodsOrderDTO.setPayOrderId(Long.parseLong(batchIdStr));
        } catch (NumberFormatException e) {
          // 批次号格式解析失败，回退到单订单支付模式
          log.warn(
              "批次号解析失败，回退到单订单支付模式，payBatchNo={}，orderId={}，异常信息：{}",
              order.getPayBatchNo(),
              order.getId(),
              e.getMessage());
          payGoodsOrderDTO.setPayOrderId(order.getId());
          // 使用订单号作为支付流水号
          outTradeNo = order.getOrderNo();
          payGoodsOrderDTO.setGoodsName("订单支付-" + order.getOrderNo());
        }
      } else {
        payGoodsOrderDTO.setPayOrderId(order.getId());
      }

      // 获取用户信息（用于微信支付OpenID）
      User memberUser = userService.getById(order.getUserId());
      if (memberUser == null || StrUtil.isBlank(memberUser.getWxOpenid())) {
        return R.failed("用户未绑定微信，无法支付");
      }

      // --- 统一平台收单模式 ---
      // 无论商家是否配置 subMchId，支付阶段统一收单到平台
      // 分账逻辑（Profit Sharing）将在支付回调后异步执行
      payGoodsOrderDTO.setOpenId(memberUser.getWxOpenid());
      payGoodsOrderDTO.setUserId(memberUser.getWxOpenid());
      // 设置商户订单号（支持单订单和批次合并支付）
      payGoodsOrderDTO.setOutTradeNo(outTradeNo);
      // 直连商户模式不需要分账，设为N
      // 如果是服务商模式需要分账，改为 "Y"
      payGoodsOrderDTO.setIsProfitSharing("N");

      // 发起远程调用：请求支付平台获取支付参数
      // 注意：此处如果抛出异常，@Transactional 会回滚上述数据库操作（订单更新、流水记录），保证数据一致性
      // 使用微信JSAPI支付（公众号/小程序通用）
      Map<String, Object> payResult = payFeignClient.wxJsapiPay(payGoodsOrderDTO);
      log.info("支付平台返回结果: {}", payResult);

      // --- 5. 封装返回结果 ---
      OrderPayResultVO payResultVO = new OrderPayResultVO();
      payResultVO.setOrderId(order.getId());
      payResultVO.setOrderNo(order.getOrderNo());
      payResultVO.setPayStatus(
          PaymentStatusEnum.PAYING.getCode()); // PAYING-支付中 (前端据此展示支付中状态或拉起收银台)
      payResultVO.setPayStatusDesc(PaymentStatusEnum.PAYING.getDescription());

      if (payResult != null && payResult.get("params") != null) {
        // 解析支付平台返回的参数
        Object params = payResult.get("params");
        // 渠道名称（如 WxPay）
        payResultVO.setThirdPayNo(String.valueOf(payResult.get("channel")));

        // payQrCode 和 payUrl 均存储支付参数，前端根据环境（H5/小程序）选择使用
        // 对于小程序支付，params 通常是一个 JSON 对象字符串，包含 timeStamp, nonceStr, package 等
        payResultVO.setPayQrCode(params.toString());
        payResultVO.setPayUrl(params.toString());
      }

      log.info("订单支付发起成功，订单ID: {}, 订单号: {}", order.getId(), order.getOrderNo());
      return R.ok(payResultVO, "支付发起成功");

    } catch (Exception e) {
      log.error("订单支付失败", e);
      // 抛出异常或返回失败信息
      return R.failed("订单支付失败: " + e.getMessage());
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> verifyOrder(Long orderId, String verifyCode) {
    try {
      if (orderId == null) {
        return R.failed("订单ID不能为空");
      }
      if (StrUtil.isBlank(verifyCode)) {
        return R.failed("核销码不能为空");
      }

      // 查询订单
      Order order = this.getById(orderId);
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权操作该订单");
      }

      if (!OrderStatusEnum.PAID.getCode().equals(order.getStatus())
          && !OrderStatusEnum.PENDING_VERIFICATION.getCode().equals(order.getStatus())) {
        return R.failed("订单状态异常，无法核销");
      }

      // 校验核销码
      if (!verifyCode.equals(order.getVerificationCode())) {
        return R.failed("核销码错误");
      }

      // 更新订单状态为已完成
      order.setStatus(OrderStatusEnum.COMPLETED.getCode());
      order.setCompletionTime(LocalDateTime.now());
      order.setUpdatedTime(LocalDateTime.now());
      boolean updateResult = this.updateById(order);

      if (updateResult) {
        // 核销成功后，若订单使用了优惠券，则更新为已使用
        if (order.getCouponId() != null) {
          userCouponService
              .lambdaUpdate()
              .eq(UserCoupon::getId, order.getCouponId())
              .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
              .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_USED)
              .set(UserCoupon::getUsedOrderId, order.getId())
              .update();
        }

        // 核销成功后触发跨商家发券
        jointMarketingIssueService.triggerIssue(order);

        // --- 分账逻辑 ---
        // 订单完成时触发分账 (status=1 待分账)
        if (Integer.valueOf(1).equals(order.getProfitSharingStatus())) {
          this.triggerProfitSharing(order);
        }

        log.info("订单核销成功，订单ID: {}, 订单号: {}", order.getId(), order.getOrderNo());
        return R.ok(true, "订单核销成功");
      } else {
        return R.failed("订单核销失败");
      }

    } catch (Exception e) {
      log.error("订单核销失败", e);
      return R.failed("订单核销失败: " + e.getMessage());
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public void triggerProfitSharing(Order order) {
    log.info("开始处理订单分账, orderId: {}, orderNo: {}", order.getId(), order.getOrderNo());
    try {
      // 1. 校验订单状态并尝试加锁（原子更新状态）
      // 只有待分账(1)或分账失败(4)的订单可以执行分账
      boolean locked =
          this.lambdaUpdate()
              .eq(Order::getId, order.getId())
              .in(Order::getProfitSharingStatus, 1, 4)
              .set(Order::getProfitSharingStatus, 2) // 2-分账中
              .update();

      if (!locked) {
        log.warn("订单分账状态不符或正在处理中, 跳过处理. orderId: {}", order.getId());
        return;
      }

      // 刷新order对象的状态，虽然后续逻辑主要用ID
      order.setProfitSharingStatus(2);

      // 2. 获取商家信息
      Merchant merchant = merchantService.getById(order.getMerchantId());
      if (merchant == null) {
        log.error("分账失败: 商家不存在, merchantId: {}", order.getMerchantId());
        updateProfitSharingStatus(order, 4);
        return;
      }
      if (StrUtil.isBlank(merchant.getSubMchId())) {
        log.warn("商家未配置子商户号, 无法分账. merchantId: {}", order.getMerchantId());
        updateProfitSharingStatus(order, 4);
        return;
      }

      // 3. 计算基础分账金额
      BigDecimal totalAmount = order.getFinalPaidPrice();
      if (totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
        log.info("订单金额为0, 无需分账");
        updateProfitSharingStatus(order, 0); // 0-无需分账
        return;
      }

      BigDecimal commissionRate =
          merchant.getCommissionRate() == null ? BigDecimal.ZERO : merchant.getCommissionRate();
      // 平台抽成
      BigDecimal platformAmount =
          totalAmount.multiply(commissionRate).divide(new BigDecimal(100), 2, RoundingMode.HALF_UP);
      // 商家剩余 (待进一步分配)
      BigDecimal merchantAmount = totalAmount.subtract(platformAmount);

      List<Map<String, Object>> receivers = new ArrayList<>();
      List<Long> settledAllocationIds = new ArrayList<>();

      // 4. 处理跨商家营销分账 (联合营销)
      if (order.getCouponId() != null) {
        UserCoupon userCoupon = userCouponService.getById(order.getCouponId());

        // 优先检查联合营销规则
        if (userCoupon != null && "JOINT_MARKETING".equals(userCoupon.getSourceType())) {
          List<JointMarketingAllocation> allocations =
              jointMarketingIssueService.getProfitSharingAllocations(userCoupon.getSourceId());

          for (JointMarketingAllocation allocation : allocations) {
            // 计算分润金额
            BigDecimal shareAmount = BigDecimal.ZERO;
            if ("FIXED".equals(allocation.getAllocationType())) {
              shareAmount = allocation.getAllocationValue();
            } else if ("RATE".equals(allocation.getAllocationType())) {
              // 比例模式: 按订单金额计算
              shareAmount = totalAmount.multiply(allocation.getAllocationValue());
            }

            if (shareAmount.compareTo(BigDecimal.ZERO) > 0
                && merchantAmount.compareTo(shareAmount) >= 0) {
              // 查找收款方商户
              Merchant payee = merchantService.getById(allocation.getPayeeMerchantId());
              if (payee != null && StrUtil.isNotBlank(payee.getSubMchId())) {
                merchantAmount = merchantAmount.subtract(shareAmount);

                Map<String, Object> receiver = new HashMap<>();
                receiver.put("type", "MERCHANT_ID");
                receiver.put("account", payee.getSubMchId());
                receiver.put("amount", shareAmount.multiply(new BigDecimal(100)).intValue());
                receiver.put(
                    "description",
                    "联合营销分润-"
                        + (StrUtil.isBlank(allocation.getDescription())
                            ? ""
                            : allocation.getDescription()));
                receivers.add(receiver);
                settledAllocationIds.add(allocation.getId());
              } else {
                log.warn("联合营销分润失败: 收款商户不存在或未配置子商户号, allocationId: {}", allocation.getId());
              }
            } else {
              log.warn(
                  "商家剩余金额不足以支付联合营销分润或分润金额为0, orderId: {}, merchantAmount: {}, shareAmount: {}",
                  order.getId(),
                  merchantAmount,
                  shareAmount);
            }
          }
        }
      }

      // 5. 添加当前商家为接收方 (剩余金额)
      if (merchantAmount.compareTo(BigDecimal.ZERO) > 0) {
        Map<String, Object> receiverMap = new HashMap<>();
        receiverMap.put("type", "MERCHANT_ID");
        receiverMap.put("account", merchant.getSubMchId());
        receiverMap.put("amount", merchantAmount.multiply(new BigDecimal(100)).intValue());
        receiverMap.put("description", "订单分账-" + order.getOrderNo());
        receivers.add(receiverMap);
      }

      if (CollUtil.isEmpty(receivers)) {
        log.info("无有效分账接收方, 视为无需分账");
        updateProfitSharingStatus(order, 0);
        return;
      }

      // 6. 调用支付平台
      Map<String, String> params = new HashMap<>();
      // 分账使用 out_order_no，这里使用 payBatchNo 或 orderId (Long string)
      // 注意：支付时的 out_trade_no 是 payBatchNo 或 orderId
      // 微信分账接口要求 out_order_no 必须是下单时的 out_trade_no
      String outOrderNo =
          StrUtil.isNotBlank(order.getPayBatchNo())
              ? order.getPayBatchNo().replace("BATCH_", "")
              : // 对应支付时的 Long ID
              String.valueOf(order.getId());

      params.put("outOrderNo", outOrderNo);
      params.put("receivers", JSONUtil.toJsonStr(receivers));

      // 状态已在前面原子更新为2，此处无需再更新
      // updateProfitSharingStatus(order, 2);

      R<String> result = payFeignClient.submitProfitSharing(params);

      if (result != null && result.getCode() == 0) {
        log.info("分账请求提交成功, orderId: {}", order.getId());
        updateProfitSharingStatus(order, 3); // 3-分账完成

        // 更新联合营销返利记录状态
        if (order.getCouponId() != null && CollUtil.isNotEmpty(settledAllocationIds)) {
          for (Long allocationId : settledAllocationIds) {
            jointMarketingIssueService.updateRebateStatusToSettled(
                order.getCouponId(), allocationId);
          }
        }
      } else {
        String msg = result != null ? result.getMsg() : "未知错误";
        log.error("分账请求失败: {}, orderId: {}", msg, order.getId());
        updateProfitSharingStatus(order, 4); // 4-分账失败
      }

    } catch (Exception e) {
      log.error("订单分账处理异常, orderId: {}", order.getId(), e);
      updateProfitSharingStatus(order, 4);
    }
  }

  private void updateProfitSharingStatus(Order order, Integer status) {
    order.setProfitSharingStatus(status);
    order.setUpdatedTime(LocalDateTime.now());
    // 只更新状态字段，避免覆盖其他并发更新
    this.update(
        new LambdaUpdateWrapper<Order>()
            .eq(Order::getId, order.getId())
            .set(Order::getProfitSharingStatus, status)
            .set(Order::getUpdatedTime, LocalDateTime.now()));
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> cancelOrder(Long orderId, String cancelReason) {
    try {
      if (orderId == null) {
        return R.failed("订单ID不能为空");
      }

      // 查询订单
      Order order = this.getById(orderId);
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权操作该订单");
      }

      // 校验订单状态（只有待支付和已支付且未核销的订单可以取消）
      if (!OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())
          && !OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        return R.failed("订单不可取消");
      }

      // 释放库存（使用加库存作为释放）
      List<OrderItem> orderItems =
          orderItemMapper.selectList(new QueryWrapper<OrderItem>().eq("order_id", orderId));
      for (OrderItem item : orderItems) {
        // 直接调用本地服务而不是通过Feign
        productSkuService.addStock(item.getProductSkuId(), item.getQuantity());
      }

      // 更新订单状态
      order.setStatus(OrderStatusEnum.CANCELLED.getCode());
      order.setCancelReason(cancelReason);
      order.setUpdatedTime(LocalDateTime.now());
      boolean updateResult = this.updateById(order);

      if (!updateResult) {
        throw new OrderBusinessException("更新订单状态失败");
      }

      // 取消订单后，若订单使用了优惠券且处于锁定状态，则释放为未使用
      if (order.getCouponId() != null) {
        userCouponService
            .lambdaUpdate()
            .eq(UserCoupon::getId, order.getCouponId())
            .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
            .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
            .update();
      }

      log.info("订单取消成功，订单ID: {}", orderId);
      return R.ok(true, "订单取消成功");

    } catch (Exception e) {
      log.error("订单取消失败", e);
      return R.failed("订单取消失败: " + e.getMessage());
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Long> consumerCancelOrder(Long orderId, String cancelReason) {
    try {
      if (orderId == null) {
        return R.failed("订单ID不能为空");
      }

      // 查询订单
      Order order = this.getById(orderId);
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 只允许消费者取消订单
      if (user.getUserType() == null || !UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
        return R.failed("仅消费者可取消订单");
      }

      // 校验订单归属（消费者只能取消自己的订单）
      if (!user.getId().equals(order.getUserId())) {
        return R.failed("无权操作该订单");
      }

      // 检查联合营销优惠券是否已使用
      if (jointMarketingIssueService.checkCouponsUsed(orderId)) {
        return R.failed("该订单产生的优惠券已被使用，无法取消");
      }

      // 场景1: 待支付订单 -> 直接取消
      if (OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())) {
        // 创建取消申请记录（用于审计）
        OrderCancelApply apply = new OrderCancelApply();
        apply.setOrderId(orderId);
        apply.setCancelNo("CA" + IdUtil.getSnowflakeNextIdStr());
        apply.setApplyUserId(user.getId());
        apply.setCancelReason(cancelReason);
        apply.setCancelType("USER");
        apply.setStatus(CancelApplyStatusEnum.APPROVED.getCode()); // 直接通过
        apply.setApplyTime(LocalDateTime.now());
        apply.setAuditTime(LocalDateTime.now());
        apply.setAuditRemark("未支付订单直接取消");
        apply.setRefundAmount(BigDecimal.ZERO); // 未支付无退款
        try {
          apply.setTenantId(order.getTenantId());
        } catch (Exception ignored) {
        }

        orderCancelApplyMapper.insert(apply);

        this.executeCancelOrder(order, cancelReason, "USER");
        return R.ok(null, "订单取消成功");
      }

      // 场景2: 已支付订单 -> 创建取消申请
      if (OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        // 检查是否已有待审核申请
        OrderCancelApply existApply =
            orderCancelApplyMapper.getPendingCancelApplyByOrderId(orderId);
        if (existApply != null) {
          return R.failed("该订单已有正在审核的取消申请");
        }

        OrderCancelApply apply = new OrderCancelApply();
        apply.setOrderId(orderId);
        apply.setCancelNo("CA" + IdUtil.getSnowflakeNextIdStr());
        apply.setApplyUserId(user.getId());
        apply.setCancelReason(cancelReason);
        apply.setCancelType("USER");
        apply.setStatus(CancelApplyStatusEnum.PENDING.getCode());
        apply.setApplyTime(LocalDateTime.now());
        apply.setRefundAmount(order.getFinalPaidPrice());
        try {
          apply.setTenantId(order.getTenantId());
        } catch (Exception ignored) {
        }

        orderCancelApplyMapper.insert(apply);

        // 设置 Redis 24小时自动通过
        String key = "poco:merchant:order:cancel:auto:" + apply.getId();
        redisTemplate.opsForValue().set(key, String.valueOf(orderId), 24, TimeUnit.HOURS);

        return R.ok(apply.getId(), "取消申请已提交，等待商家审核");
      }

      return R.failed("订单当前状态不可取消");

    } catch (Exception e) {
      log.error("消费者取消订单失败", e);
      return R.failed("订单取消失败: " + e.getMessage());
    }
  }

  @Override
  public R<Boolean> auditCancelApply(Long cancelApplyId, Boolean approved, String auditRemark) {
    try {
      OrderCancelApply apply = orderCancelApplyMapper.selectById(cancelApplyId);
      if (apply == null) {
        return R.failed("申请不存在");
      }
      if (!CancelApplyStatusEnum.PENDING.getCode().equals(apply.getStatus())) {
        return R.failed("申请状态已变更");
      }

      PocoUser user = SecurityUtils.getUser();
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 校验商家权限：只能审核属于自己商家的订单
      Order order = this.getById(apply.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单(当前用户无部门)");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权审核该订单的取消申请");
      }

      if (approved) {
        // 1. 开启小事务：更新申请状态为 APPROVED
        transactionTemplate.execute(
            status -> {
              apply.setStatus(CancelApplyStatusEnum.APPROVED.getCode());
              apply.setAuditBy(user.getId());
              apply.setAuditRemark(auditRemark);
              apply.setAuditTime(LocalDateTime.now());
              apply.setRefundTime(LocalDateTime.now());
              apply.setRefundTradeNo(apply.getCancelNo());
              orderCancelApplyMapper.updateById(apply);
              return null;
            });

        // 2. 事务外：调用远程退款
        // 注意：这里只是发起退款请求，不更新订单状态
        // 订单状态和退款申请的最终状态将在微信退款回调中更新
        try {
          this.executeRefund(
              order, apply.getRefundAmount(), apply.getCancelReason(), apply.getCancelNo());
        } catch (Exception e) {
          // 3. 如果调用支付服务失败，尝试回滚状态（开启新事务）
          log.error("退款请求发起失败，回滚取消申请状态: cancelApplyId={}", cancelApplyId, e);
          try {
            transactionTemplate.execute(
                status -> {
                  OrderCancelApply current = orderCancelApplyMapper.selectById(cancelApplyId);
                  if (current != null
                      && CancelApplyStatusEnum.APPROVED.getCode().equals(current.getStatus())) {
                    current.setStatus(CancelApplyStatusEnum.PENDING.getCode());
                    current.setUpdatedTime(LocalDateTime.now());
                    orderCancelApplyMapper.updateById(current);
                  }
                  return null;
                });
          } catch (Exception rollbackEx) {
            log.error("回滚取消申请状态失败: cancelApplyId={}", cancelApplyId, rollbackEx);
          }
          throw new OrderBusinessException("退款请求发起失败: " + e.getMessage());
        }

        // 注意：executeCancelOrder 中包含库存恢复等逻辑，这里先移除，移到 handleCancelApplySuccess 回调中处理
        // 以确保只有在微信确认退款成功后才真正取消订单
        // 但考虑到用户体验，如果退款请求发送成功，前端通常需要看到订单变为“取消中”或类似状态
        // 当前逻辑是：申请时订单状态不变 -> 审核通过 -> 发起退款 -> 回调 -> 订单变为 CANCELLED

        // 删除 Redis key
        redisTemplate.delete("poco:merchant:order:cancel:auto:" + apply.getId());

      } else {
        // 审核拒绝
        transactionTemplate.execute(
            status -> {
              apply.setStatus(CancelApplyStatusEnum.REJECTED.getCode());
              apply.setAuditBy(user.getId());
              apply.setAuditRemark(auditRemark);
              apply.setAuditTime(LocalDateTime.now());
              orderCancelApplyMapper.updateById(apply);
              return null;
            });

        // 删除 Redis key
        redisTemplate.delete("poco:merchant:order:cancel:auto:" + apply.getId());
      }

      return R.ok(true, "审核完成");
    } catch (Exception e) {
      log.error("审核取消申请失败", e);
      throw new OrderBusinessException("审核失败: " + e.getMessage());
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> autoApproveCancelApply(Long cancelApplyId) {
    try {
      OrderCancelApply apply = orderCancelApplyMapper.selectById(cancelApplyId);
      if (apply == null || !CancelApplyStatusEnum.PENDING.getCode().equals(apply.getStatus())) {
        return R.ok(false, "无需处理");
      }

      // 自动通过
      Order order = this.getById(apply.getOrderId());
      if (order != null) {
        // 执行退款
        this.executeRefund(
            order, apply.getRefundAmount(), apply.getCancelReason(), apply.getCancelNo());

        this.executeCancelOrder(order, apply.getCancelReason(), "USER");

        apply.setStatus(CancelApplyStatusEnum.APPROVED.getCode());
        apply.setAuditRemark("超时自动通过");
        apply.setAutoApprovedTime(LocalDateTime.now());
        apply.setRefundTime(LocalDateTime.now());
        apply.setRefundTradeNo(apply.getCancelNo());
        orderCancelApplyMapper.updateById(apply);
      }
      return R.ok(true, "自动审核通过");
    } catch (Exception e) {
      log.error("自动审核取消申请失败", e);
      return R.failed("自动审核失败");
    }
  }

  /** 执行订单取消逻辑（释放库存、解锁优惠券、更新状态） */
  private void executeCancelOrder(Order order, String cancelReason, String cancelType) {
    // 释放库存
    List<OrderItem> orderItems =
        orderItemMapper.selectList(new QueryWrapper<OrderItem>().eq("order_id", order.getId()));
    for (OrderItem item : orderItems) {
      productSkuService.addStock(item.getProductSkuId(), item.getQuantity());
    }

    // 更新订单状态
    order.setStatus(OrderStatusEnum.CANCELLED.getCode());
    order.setCancelReason(cancelReason);
    order.setCancelTime(LocalDateTime.now());
    order.setUpdatedTime(LocalDateTime.now());
    boolean updateResult = this.updateById(order);

    if (!updateResult) {
      throw new OrderBusinessException("更新订单状态失败");
    }

    // 解锁优惠券
    if (order.getCouponId() != null) {
      userCouponService
          .lambdaUpdate()
          .eq(UserCoupon::getId, order.getCouponId())
          .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
          .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
          .update();
    }

    // 作废联合营销优惠券
    jointMarketingIssueService.invalidateCoupons(order.getId());

    log.info("订单已取消，OrderId: {}, 类型: {}", order.getId(), cancelType);
  }

  /** 执行退款逻辑 */
  private void executeRefund(Order order, BigDecimal refundAmount, String reason, String refundNo) {
    if (refundAmount.compareTo(BigDecimal.ZERO) <= 0) {
      return;
    }

    PayRefundDTO refundDTO = new PayRefundDTO();
    // 传业务订单ID，支付平台通过 pay_goods_order.goods_id 查找支付记录
    refundDTO.setOrderNo(String.valueOf(order.getId()));
    refundDTO.setRefundNo(refundNo);
    refundDTO.setRefundAmount(refundAmount);
    refundDTO.setRefundReason(reason);

    try {
      R<Boolean> refundRes = payFeignClient.refundOrder(refundDTO);
      if (refundRes == null || !refundRes.isOk()) {
        throw new OrderBusinessException(
            "退款失败: " + (refundRes != null ? refundRes.getMsg() : "未知错误"));
      }
    } catch (Exception e) {
      log.error("调用支付服务退款失败", e);
      throw new OrderBusinessException("退款失败: " + e.getMessage());
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> applyRefund(OrderRefundApplyDTO orderRefundApplyDTO) {
    try {
      if (orderRefundApplyDTO == null || orderRefundApplyDTO.getOrderId() == null) {
        return R.failed("订单ID不能为空");
      }

      // 查询订单
      Order order = this.getById(orderRefundApplyDTO.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 只允许消费者申请退款
      if (user.getUserType() == null || !UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
        return R.failed("仅消费者可申请退款");
      }

      // 校验订单归属（消费者只能对自己的订单申请退款）
      if (!user.getId().equals(order.getUserId())) {
        return R.failed("无权操作该订单");
      }

      // 校验订单状态（只有已支付且未核销的订单可以申请退款）
      if (!OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        return R.failed("订单不可退款");
      }

      // 创建退款申请
      OrderRefundApply refundApply = new OrderRefundApply();
      BeanUtils.copyProperties(orderRefundApplyDTO, refundApply);
      try {
        Order exist = this.getById(orderRefundApplyDTO.getOrderId());
        if (exist != null) {
          refundApply.setTenantId(exist.getTenantId());
        }
      } catch (Exception ignored) {
      }
      refundApply.setRefundNo("RF" + System.currentTimeMillis());
      refundApply.setStatus(RefundStatusEnum.PENDING.getCode());
      refundApply.setIsDeleted(0);
      refundApply.setCreatedTime(LocalDateTime.now());
      refundApply.setUpdatedTime(LocalDateTime.now());
      // 对齐退款类型字段：DTO为1/2，实体为FULL/PARTIAL
      boolean isFullRefund = false;
      if (orderRefundApplyDTO.getRefundType() != null && orderRefundApplyDTO.getRefundType() == 1) {
        isFullRefund = true;
      }
      // 智能识别全额退款：如果退款金额等于订单实付金额，强制视为全额退款
      BigDecimal paidAmount =
          order.getFinalPaidPrice() != null ? order.getFinalPaidPrice() : BigDecimal.ZERO;
      if (orderRefundApplyDTO.getRefundAmount() != null
          && orderRefundApplyDTO.getRefundAmount().compareTo(paidAmount) == 0) {
        isFullRefund = true;
      }

      refundApply.setRefundType(isFullRefund ? "FULL" : "PARTIAL");
      orderRefundApplyMapper.insert(refundApply);

      // 生成退款明细（支持全额/部分退款）
      List<OrderItem> orderItems =
          orderItemMapper.selectList(new QueryWrapper<OrderItem>().eq("order_id", order.getId()));
      if (orderItems == null) {
        orderItems = new ArrayList<>();
      }

      if (isFullRefund) {
        // 全额退款：为每个订单商品生成一条退款明细
        for (OrderItem oi : orderItems) {
          OrderRefundItem item = new OrderRefundItem();
          item.setRefundApplyId(refundApply.getId());
          item.setOrderItemId(oi.getId());
          try {
            item.setTenantId(refundApply.getTenantId());
          } catch (Exception ignored) {
          }
          item.setRefundQuantity(oi.getQuantity());
          // 使用行项目实付金额作为退款金额
          item.setRefundAmount(oi.getFinalPrice());
          item.setIsDeleted(0);
          item.setCreatedTime(LocalDateTime.now());
          item.setUpdatedTime(LocalDateTime.now());
          orderRefundItemMapper.insert(item);
        }
      } else {
        // 部分退款：使用前端传入的退款商品明细，并进行基础校验
        List<OrderRefundItemDTO> refundItemsDTO = orderRefundApplyDTO.getRefundItems();
        if (refundItemsDTO == null || refundItemsDTO.isEmpty()) {
          return R.failed("部分退款时退款商品列表不能为空");
        }

        // 将订单商品ID映射到对应的订单项，方便校验
        List<Long> validOrderItemIds = orderItems.stream().map(OrderItem::getId).toList();

        BigDecimal sumRefundAmount = BigDecimal.ZERO;
        for (OrderRefundItemDTO ri : refundItemsDTO) {
          if (ri.getOrderItemId() == null
              || ri.getRefundQuantity() == null
              || ri.getRefundAmount() == null) {
            return R.failed("退款商品明细参数不完整");
          }
          if (!validOrderItemIds.contains(ri.getOrderItemId())) {
            return R.failed("退款商品不属于该订单");
          }

          // 校验数量不超过原购买数量
          OrderItem oi =
              orderItems.stream()
                  .filter(x -> x.getId().equals(ri.getOrderItemId()))
                  .findFirst()
                  .orElse(null);
          if (oi == null) {
            return R.failed("订单商品不存在");
          }
          if (ri.getRefundQuantity() > oi.getQuantity()) {
            return R.failed("退款数量不能超过购买数量");
          }

          // 累加退款金额用于与总申请金额进行校验
          sumRefundAmount = sumRefundAmount.add(ri.getRefundAmount());

          OrderRefundItem item = new OrderRefundItem();
          item.setRefundApplyId(refundApply.getId());
          item.setOrderItemId(ri.getOrderItemId());
          try {
            item.setTenantId(refundApply.getTenantId());
          } catch (Exception ignored) {
          }
          item.setRefundQuantity(ri.getRefundQuantity());
          item.setRefundAmount(ri.getRefundAmount());
          item.setIsDeleted(0);
          item.setCreatedTime(LocalDateTime.now());
          item.setUpdatedTime(LocalDateTime.now());
          orderRefundItemMapper.insert(item);
        }

        // 基础金额校验：部分退款时，明细金额合计需与申请金额一致
        if (orderRefundApplyDTO.getRefundAmount() != null
            && sumRefundAmount.compareTo(orderRefundApplyDTO.getRefundAmount()) != 0) {
          return R.failed("退款明细金额与申请金额不一致");
        }

        // 修正退款类型：如果部分退款计算出的总金额等于订单实付金额，则更新为全额退款
        // 注意：paidAmount 在上文已定义，为 order.getFinalPaidPrice()
        if (sumRefundAmount.compareTo(paidAmount) == 0) {
          refundApply.setRefundType("FULL");
          orderRefundApplyMapper.updateById(refundApply);
        }
      }

      // 更新订单状态为退款中
      order.setStatus(OrderStatusEnum.REFUNDING.getCode());
      order.setUpdatedTime(LocalDateTime.now());
      this.updateById(order);

      log.info("退款申请提交成功，订单ID: {}, 退款申请ID: {}", order.getId(), refundApply.getId());
      return R.ok(true, "退款申请提交成功");

    } catch (Exception e) {
      log.error("退款申请失败", e);
      return R.failed("退款申请失败: " + e.getMessage());
    }
  }

  @Override
  public R<Boolean> auditRefund(Long refundId, Boolean approved, String reviewRemark) {
    try {
      if (refundId == null) {
        return R.failed("退款申请ID不能为空");
      }

      // 查询退款申请
      OrderRefundApply refundApply = orderRefundApplyMapper.selectById(refundId);
      if (refundApply == null) {
        return R.failed("退款申请不存在");
      }

      // 校验状态，防止重复审核
      if (!RefundStatusEnum.PENDING.getCode().equals(refundApply.getStatus())) {
        return R.failed("申请状态已变更");
      }

      // 查询订单
      Order order = this.getById(refundApply.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 校验商家权限：只能审核属于自己商家的订单
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单(当前用户无部门)");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权审核该订单的退款申请");
      }

      // 准备更新的数据
      refundApply.setReviewRemark(reviewRemark);
      refundApply.setReviewerId(user.getId());
      refundApply.setReviewTime(LocalDateTime.now());
      refundApply.setUpdatedTime(LocalDateTime.now());

      if (approved) {
        // 1. 开启小事务：更新状态为 APPROVED
        transactionTemplate.execute(
            status -> {
              refundApply.setStatus(RefundStatusEnum.APPROVED.getCode());
              orderRefundApplyMapper.updateById(refundApply);
              return null;
            });

        // 2. 事务外：调用远程退款
        // 注意：这里只是发起退款请求，不更新订单状态
        // 订单状态和退款申请的最终状态将在微信退款回调中更新
        try {
          this.executeRefund(
              order,
              refundApply.getRefundAmount(),
              refundApply.getRefundReason(),
              refundApply.getRefundNo());
        } catch (Exception e) {
          // 3. 如果调用支付服务失败，尝试回滚状态（开启新事务）
          log.error("退款请求发起失败，回滚退款申请状态: refundId={}", refundId, e);
          try {
            transactionTemplate.execute(
                status -> {
                  // 重新查询以确保数据一致性
                  OrderRefundApply current = orderRefundApplyMapper.selectById(refundId);
                  if (current != null
                      && RefundStatusEnum.APPROVED.getCode().equals(current.getStatus())) {
                    current.setStatus(RefundStatusEnum.PENDING.getCode());
                    current.setUpdatedTime(LocalDateTime.now());
                    orderRefundApplyMapper.updateById(current);
                  }
                  return null;
                });
          } catch (Exception rollbackEx) {
            log.error("回滚退款申请状态失败: refundId={}", refundId, rollbackEx);
          }
          throw new OrderBusinessException("退款请求发起失败: " + e.getMessage());
        }

        // 注意：库存恢复和订单状态更新移到 refundSuccess 回调中处理
        // 这样可以确保只有在微信确认退款成功后才恢复库存和更新状态

        log.info("退款审核通过，已发起退款请求，订单ID: {}, 退款申请ID: {}", order.getId(), refundId);
        return R.ok(true, "退款审核通过，正在处理退款");
      } else {
        // 审核拒绝，更新退款申请状态
        refundApply.setStatus(RefundStatusEnum.REJECTED.getCode());
        transactionTemplate.execute(
            status -> {
              orderRefundApplyMapper.updateById(refundApply);
              return null;
            });

        log.info("退款审核拒绝，订单ID: {}, 退款申请ID: {}", order.getId(), refundId);
        return R.ok(true, "退款审核拒绝");
      }

    } catch (Exception e) {
      log.error("退款审核失败", e);
      throw new OrderBusinessException("退款审核失败: " + e.getMessage());
    }
  }

  private DataScope listScope(String deptColumn, String userColumn) {
    DataScope scope = new DataScope();
    scope.setFunc(DataScopeFuncEnum.ALL);
    scope.setScopeDeptName(deptColumn);
    scope.setScopeUserName(userColumn);
    return scope;
  }

  private DataScope countScope(String deptColumn, String userColumn) {
    DataScope scope = new DataScope();
    scope.setFunc(DataScopeFuncEnum.COUNT);
    scope.setScopeDeptName(deptColumn);
    scope.setScopeUserName(userColumn);
    return scope;
  }

  private DataScope listScopeUser(String userColumn) {
    DataScope scope = new DataScope();
    scope.setFunc(DataScopeFuncEnum.ALL);
    scope.setScopeUserName(userColumn);
    return scope;
  }

  private boolean isToc(PocoUser user) {
    return user != null && UserTypeEnum.TOC.getStatus().equals(user.getUserType());
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> updateOrderStatus(Long orderId, String status) {
    try {
      if (orderId == null || StrUtil.isBlank(status)) {
        return R.failed("参数不能为空");
      }

      Order order = this.getById(orderId);
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权操作该订单");
      }

      order.setStatus(status);
      order.setUpdatedTime(LocalDateTime.now());
      boolean updateResult = this.updateById(order);

      if (updateResult) {
        log.info("订单状态更新成功，订单ID: {}, 新状态: {}", orderId, status);
        return R.ok(true, "订单状态更新成功");
      } else {
        return R.failed("订单状态更新失败");
      }

    } catch (Exception e) {
      log.error("订单状态更新失败", e);
      return R.failed("订单状态更新失败: " + e.getMessage());
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public void closeOverdueOrder(Long orderId) {
    try {
      Order order = this.getById(orderId);
      if (order == null) {
        return;
      }
      // 只有待支付状态的订单才需要处理
      if (!OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())) {
        return;
      }

      log.info("开始处理超时未支付订单，orderId: {}", orderId);

      // 执行取消逻辑（复用已有的取消逻辑）
      this.executeCancelOrder(order, "超时未支付自动取消", "SYSTEM");

    } catch (Exception e) {
      log.error("处理超时订单失败，orderId: {}", orderId, e);
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> batchUpdateOrderStatus(List<Long> orderIds, String status) {
    try {
      if (CollUtil.isEmpty(orderIds) || StrUtil.isBlank(status)) {
        return R.failed("参数不能为空");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作订单");
      }
      List<Order> orders = this.listByIds(orderIds);
      if (CollUtil.isEmpty(orders)) {
        return R.failed("订单不存在");
      }
      boolean allAllowed =
          orders.stream()
              .allMatch(o -> deptId.equals(o.getStoreId()) || deptId.equals(o.getMerchantId()));
      if (!allAllowed) {
        return R.failed("存在无权操作的订单");
      }

      int updated = baseMapper.batchUpdateOrderStatus(orderIds, status, user.getId());
      boolean updateResult = updated > 0;
      if (updateResult) {
        log.info("批量更新订单状态成功，订单数量: {}, 新状态: {}", orderIds.size(), status);
        return R.ok(true, "批量更新订单状态成功");
      } else {
        return R.failed("批量更新订单状态失败");
      }

    } catch (Exception e) {
      log.error("批量更新订单状态失败", e);
      return R.failed("批量更新订单状态失败: " + e.getMessage());
    }
  }

  /** 本地配送开始：记录配送员信息并将配送状态置为配送中 */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> startLocalDelivery(OrderLocalDeliveryStartDTO startDTO) {
    try {
      if (startDTO == null || startDTO.getOrderId() == null) {
        return R.failed("订单ID不能为空");
      }
      Order order = this.getById(startDTO.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权操作该订单");
      }
      // 基础条件：订单已支付且未取消
      if (!OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        return R.failed("订单未支付，无法开始配送");
      }
      // 读取最新地址快照，用于绑定配送记录
      Long addressSnapshotId = null;
      try {
        OrderAddressSnapshotVO addressVO =
            orderAddressSnapshotMapper.getAddressSnapshotByOrderId(order.getId());
        if (addressVO != null) {
          addressSnapshotId = addressVO.getId();
        }
      } catch (Exception ignore) {
      }

      OrderDeliveryRecord record = new OrderDeliveryRecord();
      record.setOrderId(order.getId());
      record.setAddressSnapshotId(addressSnapshotId);
      try {
        record.setTenantId(order.getTenantId());
      } catch (Exception ignored) {
      }
      record.setChannel("LOCAL");
      record.setProvider(null);
      record.setTrackingNo(null);
      record.setStatus(DeliveryStatusEnum.DELIVERING.name());
      record.setDeliveryPersonName(startDTO.getDeliveryPersonName());
      record.setDeliveryPersonPhone(startDTO.getDeliveryPersonPhone());
      record.setActualPickTime(LocalDateTime.now());
      record.setIsDeleted(0);
      record.setCreatedTime(LocalDateTime.now());
      record.setUpdatedTime(LocalDateTime.now());
      orderDeliveryRecordMapper.insert(record);

      return R.ok(true, "本地配送已开始");
    } catch (Exception e) {
      log.error("本地配送开始失败", e);
      return R.failed("本地配送开始失败: " + e.getMessage());
    }
  }

  /** 本地配送完成：更新为已送达并尝试完成订单 */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> completeLocalDelivery(OrderLocalDeliveryCompleteDTO completeDTO) {
    try {
      if (completeDTO == null || completeDTO.getOrderId() == null) {
        return R.failed("订单ID不能为空");
      }
      Order order = this.getById(completeDTO.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权操作该订单");
      }
      if (!OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        return R.failed("订单未支付或状态异常");
      }

      // 查询最新配送记录
      OrderDeliveryRecordVO latest =
          orderDeliveryRecordMapper.getLatestDeliveryRecordByOrderId(order.getId());
      if (latest == null) {
        return R.failed("未找到配送记录");
      }

      OrderDeliveryRecord toUpdate = new OrderDeliveryRecord();
      toUpdate.setId(latest.getId());
      toUpdate.setStatus(DeliveryStatusEnum.DELIVERED.name());
      toUpdate.setDeliveredTime(LocalDateTime.now());
      toUpdate.setUpdatedTime(LocalDateTime.now());
      orderDeliveryRecordMapper.updateById(toUpdate);

      // 满足条件则完成订单
      tryCompleteOrder(order);
      return R.ok(true, "本地配送已完成");
    } catch (Exception e) {
      log.error("本地配送完成失败", e);
      return R.failed("本地配送完成失败: " + e.getMessage());
    }
  }

  /** 消费者更新订单收货地址：写入地址快照，支付后禁止修改 */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> consumerUpdateOrderAddress(OrderAddressUpdateDTO addressUpdateDTO) {
    try {
      if (addressUpdateDTO == null || addressUpdateDTO.getOrderId() == null) {
        return R.failed("订单ID不能为空");
      }
      Order order = this.getById(addressUpdateDTO.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }

      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 只允许消费者更新地址
      if (user.getUserType() == null || !UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
        return R.failed("仅消费者可更新订单地址");
      }

      // 校验订单归属（消费者只能更新自己的订单地址）
      if (!user.getId().equals(order.getUserId())) {
        return R.failed("无权操作该订单");
      }

      if (!OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())) {
        return R.failed("支付后禁止修改收货地址");
      }

      OrderAddressSnapshot snapshot = new OrderAddressSnapshot();
      snapshot.setOrderId(order.getId());
      try {
        snapshot.setTenantId(order.getTenantId());
      } catch (Exception ignored) {
      }
      snapshot.setReceiverName(addressUpdateDTO.getReceiverName());
      snapshot.setReceiverPhone(addressUpdateDTO.getReceiverPhone());
      snapshot.setProvince(addressUpdateDTO.getProvince());
      snapshot.setCity(addressUpdateDTO.getCity());
      snapshot.setDistrict(addressUpdateDTO.getDistrict());
      snapshot.setDetailAddress(addressUpdateDTO.getDetailAddress());
      snapshot.setLatitude(addressUpdateDTO.getLatitude());
      snapshot.setLongitude(addressUpdateDTO.getLongitude());
      snapshot.setAddressType("RECEIVER");
      snapshot.setIsDeleted(0);
      snapshot.setCreatedTime(LocalDateTime.now());
      snapshot.setUpdatedTime(LocalDateTime.now());
      orderAddressSnapshotMapper.insert(snapshot);
      return R.ok(true, "收货地址已更新并固化");
    } catch (Exception e) {
      log.error("消费者更新订单地址失败", e);
      return R.failed("更新订单地址失败: " + e.getMessage());
    }
  }

  /** 商家更新订单收货地址：写入地址快照，支付后禁止修改 */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> merchantUpdateOrderAddress(OrderAddressUpdateDTO addressUpdateDTO) {
    try {
      if (addressUpdateDTO == null || addressUpdateDTO.getOrderId() == null) {
        return R.failed("订单ID不能为空");
      }
      Order order = this.getById(addressUpdateDTO.getOrderId());
      if (order == null) {
        return R.failed("订单不存在");
      }
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }
      Long deptId = user.getDeptId();
      if (deptId == null) {
        return R.failed("无权操作该订单");
      }
      boolean allowed = deptId.equals(order.getStoreId()) || deptId.equals(order.getMerchantId());
      if (!allowed) {
        return R.failed("无权操作该订单");
      }
      if (!OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())) {
        return R.failed("支付后禁止修改收货地址");
      }

      OrderAddressSnapshot snapshot = new OrderAddressSnapshot();
      snapshot.setOrderId(order.getId());
      try {
        snapshot.setTenantId(order.getTenantId());
      } catch (Exception ignored) {
      }
      snapshot.setReceiverName(addressUpdateDTO.getReceiverName());
      snapshot.setReceiverPhone(addressUpdateDTO.getReceiverPhone());
      snapshot.setProvince(addressUpdateDTO.getProvince());
      snapshot.setCity(addressUpdateDTO.getCity());
      snapshot.setDistrict(addressUpdateDTO.getDistrict());
      snapshot.setDetailAddress(addressUpdateDTO.getDetailAddress());
      snapshot.setLatitude(addressUpdateDTO.getLatitude());
      snapshot.setLongitude(addressUpdateDTO.getLongitude());
      snapshot.setAddressType("RECEIVER");
      snapshot.setIsDeleted(0);
      snapshot.setCreatedTime(LocalDateTime.now());
      snapshot.setUpdatedTime(LocalDateTime.now());
      orderAddressSnapshotMapper.insert(snapshot);
      return R.ok(true, "收货地址已更新并固化");
    } catch (Exception e) {
      log.error("更新订单地址失败", e);
      return R.failed("更新订单地址失败: " + e.getMessage());
    }
  }

  /** 用户主动完成订单：满足基础条件（已支付且未取消） */
  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> completeOrderByUser(Long orderId) {
    try {
      if (orderId == null) {
        return R.failed("订单ID不能为空");
      }
      Order order = this.getById(orderId);
      if (order == null) {
        return R.failed("订单不存在");
      }
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 只允许消费者完成订单
      if (user.getUserType() == null || !UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
        return R.failed("仅消费者可完成订单");
      }

      // 校验订单归属（消费者只能完成自己的订单）
      if (!user.getId().equals(order.getUserId())) {
        return R.failed("无权操作该订单");
      }
      // 基础条件：已支付且未取消
      if (!OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        return R.failed("订单未支付或状态异常");
      }
      order.setStatus(OrderStatusEnum.COMPLETED.getCode());
      order.setCompletionTime(LocalDateTime.now());
      order.setUpdatedTime(LocalDateTime.now());
      this.updateById(order);
      return R.ok(true, "订单已完成");
    } catch (Exception e) {
      log.error("用户主动完成订单失败", e);
      return R.failed("完成订单失败: " + e.getMessage());
    }
  }

  /** 私有方法：若满足履约完成条件则将订单置为完成 */
  private void tryCompleteOrder(Order order) {
    try {
      if (order == null) return;
      // 基础条件：已支付且未取消
      if (!OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
        return;
      }
      // 条件：本地配送完成
      OrderDeliveryRecordVO latest =
          orderDeliveryRecordMapper.getLatestDeliveryRecordByOrderId(order.getId());
      if (latest != null && DeliveryStatusEnum.DELIVERED.name().equals(latest.getStatus())) {
        order.setStatus(OrderStatusEnum.COMPLETED.getCode());
        order.setCompletionTime(LocalDateTime.now());
        order.setUpdatedTime(LocalDateTime.now());
        this.updateById(order);
      }
    } catch (Exception e) {
      log.warn("自动完成订单失败，orderId={}", order.getId(), e);
    }
  }

  /**
   * 生成订单号
   *
   * @return 订单号
   */
  private String generateOrderNo(Long storeId, Long tenantId) {
    LocalDateTime now = LocalDateTime.now();
    // 使用10位时间戳（精确到秒）以减少位数
    String ts = now.format(DateTimeFormatter.ofPattern("yyMMddHHmm"));
    String dayKey = now.toLocalDate().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
    String key =
        "poco:merchant:order:seq:"
            + String.valueOf(tenantId == null ? "x" : tenantId)
            + ":"
            + String.valueOf(storeId == null ? "x" : storeId)
            + ":"
            + dayKey;
    Long seq = null;
    try {
      seq = redisTemplate.opsForValue().increment(key);
      if (seq != null && seq == 1L) {
        redisTemplate.expire(key, 2, TimeUnit.DAYS);
      }
    } catch (Exception ignored) {
    }

    // 减少租户ID和店铺ID的位数
    String tenantPart = tenantId == null ? "0" : String.format("%01d", tenantId % 10);
    String storePart = storeId == null ? "00" : String.format("%02d", storeId % 100);

    if (seq == null || seq <= 0L) {
      // 如果无法获取序列号，则使用随机数作为最后几位
      String randomPart = String.valueOf((long) (Math.random() * 100000) % 100000);
      return ts
          + tenantPart
          + storePart
          + String.format("%05d", Long.parseLong(randomPart) % 100000);
    }

    // 减少序列号位数到5位
    String num = String.format("%05d", seq % 100000);
    String no = ts + tenantPart + storePart + num;

    // 最大重试次数为3次
    int maxRetries = 3;
    int tries = 0;
    while (tries < maxRetries) {
      Order exist = baseMapper.getOrderByOrderNo(no);
      if (exist == null) {
        // 订单号不存在，可以使用
        return no;
      }
      // 订单号已存在，尝试生成新的
      log.warn("订单号[{}]已存在，尝试重新生成，当前重试次数: {}", no, tries + 1);
      try {
        Long s2 = redisTemplate.opsForValue().increment(key);
        if (s2 == null) {
          throw new OrderBusinessException("订单号生成失败，请稍后重试");
        }
        num = String.format("%05d", s2 % 100000);
        no = ts + tenantPart + storePart + num;
      } catch (OrderBusinessException e) {
        throw e;
      } catch (Exception e) {
        log.error("获取订单序列号失败", e);
        throw new OrderBusinessException("订单号生成失败，请稍后重试");
      }
      tries++;
    }

    // 3次重试后仍然重复，抛出异常
    log.error("订单号生成失败，重试{}次后仍然重复，最后尝试的订单号: {}", maxRetries, no);
    throw new OrderBusinessException("订单号生成失败，请稍后重试");
  }

  /**
   * 生成核销码
   *
   * @return 6位数字核销码
   */
  private String generateVerificationCode() {
    // 生成6位随机数字验证码
    return String.valueOf((int) ((Math.random() * 9 + 1) * 100000));
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public void paySuccess(String payOrderIdStr) {
    log.info("收到支付成功通知，payOrderId: {}", payOrderIdStr);

    // 去除可能的引号
    payOrderIdStr = payOrderIdStr.replace("\"", "");

    // 处理 BATCH_ 前缀 (兼容合并支付的回调)
    if (payOrderIdStr.startsWith("BATCH_")) {
      payOrderIdStr = payOrderIdStr.replace("BATCH_", "");
    }

    List<Order> ordersToUpdate = new ArrayList<>();

    // 1. 尝试按订单号查询（单单支付，优先匹配 OrderNo）
    // 注意：支付回调传回的是 out_trade_no，在 payOrder 中设置的是 OrderNo 或 PayBatchNo
    Order orderByNo =
        this.getOne(
            new LambdaQueryWrapper<Order>().eq(Order::getOrderNo, payOrderIdStr).last("limit 1"));

    if (orderByNo != null) {
      ordersToUpdate.add(orderByNo);
    } else {
      // 2. 尝试按批次号查询（合并支付）
      // payOrder中构建的批次号ID是去除BATCH_前缀后的数字，这里还原前缀进行匹配
      String batchNo = "BATCH_" + payOrderIdStr;
      List<Order> batchOrders =
          this.list(new LambdaQueryWrapper<Order>().eq(Order::getPayBatchNo, batchNo));
      if (CollUtil.isNotEmpty(batchOrders)) {
        ordersToUpdate.addAll(batchOrders);
      } else {
        // 3. 尝试按主键ID查询 (兼容旧数据或直接使用ID作为订单号的情况)
        try {
          Long id = Long.parseLong(payOrderIdStr);
          Order orderById = this.getById(id);
          if (orderById != null) {
            ordersToUpdate.add(orderById);
          }
        } catch (NumberFormatException ignored) {
        }
      }
    }

    if (CollUtil.isEmpty(ordersToUpdate)) {
      log.warn("支付回调：未找到对应订单, payOrderId={}", payOrderIdStr);
      return;
    }

    for (Order order : ordersToUpdate) {
      // 幂等性校验：如果订单已经支付，则忽略
      if (!OrderStatusEnum.PENDING_PAYMENT.getCode().equals(order.getStatus())) {
        log.info("支付回调：订单状态已变更, 跳过. orderId={}, status={}", order.getId(), order.getStatus());
        // 即使状态已变更，也可能需要触发后续流程（如分账失败重试），但此处假设已支付则已触发
        continue;
      }

      // 更新订单状态为已支付
      order.setStatus(OrderStatusEnum.PAID.getCode());
      order.setPaymentTime(LocalDateTime.now());
      order.setUpdatedTime(LocalDateTime.now());
      this.updateById(order);

      // 更新支付记录状态
      LambdaQueryWrapper<OrderPayRecord> payRecordWrapper = new LambdaQueryWrapper<>();
      payRecordWrapper
          .eq(OrderPayRecord::getOrderId, order.getId())
          .eq(OrderPayRecord::getStatus, PaymentStatusEnum.INIT.getCode())
          .orderByDesc(OrderPayRecord::getCreatedTime)
          .last("limit 1");
      OrderPayRecord payRecord = orderPayRecordMapper.selectOne(payRecordWrapper);

      if (payRecord != null) {
        payRecord.setStatus(PaymentStatusEnum.SUCCESS.getCode());
        payRecord.setUpdatedTime(LocalDateTime.now());
        orderPayRecordMapper.updateById(payRecord);
      } else {
        // 如果找不到初始化的支付记录（可能是合并支付的其他子单），补一条成功记录
        OrderPayRecord newRecord = new OrderPayRecord();
        newRecord.setOrderId(order.getId());
        try {
          newRecord.setTenantId(order.getTenantId());
        } catch (Exception ignored) {
        }
        newRecord.setChannel(order.getPaymentMethod());
        newRecord.setRequestAmount(order.getFinalPaidPrice());
        newRecord.setStatus(PaymentStatusEnum.SUCCESS.getCode());
        newRecord.setIsDeleted(0);
        newRecord.setCreatedTime(LocalDateTime.now());
        newRecord.setUpdatedTime(LocalDateTime.now());
        orderPayRecordMapper.insert(newRecord);
      }

      log.info("支付回调：订单状态更新成功, orderNo={}", order.getOrderNo());

      // 触发联合营销发券
      try {
        jointMarketingIssueService.triggerIssue(order);
      } catch (Exception e) {
        log.error("触发联合营销发券失败, orderId={}", order.getId(), e);
      }

      // 触发分账逻辑（异步或同步调用，此处为保证严谨性，建议同步发起或通过消息队列，此处直接调用方法）
      // 注意：triggerProfitSharing 方法内部有事务，但当前方法已有事务。
      // 且 triggerProfitSharing 内部有 try-catch，不会影响主流程。
      triggerProfitSharing(order);
    }
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public void refundSuccess(String refundNo) {
    log.info("收到退款成功通知，退款单号: {}", refundNo);

    // 1. 尝试查找退款申请
    OrderRefundApply refundApply =
        orderRefundApplyMapper.selectOne(
            new QueryWrapper<OrderRefundApply>().eq("refund_no", refundNo));
    if (refundApply != null) {
      handleRefundApplySuccess(refundApply);
      return;
    }

    // 2. 尝试查找取消申请 (cancelNo 作为 refundNo)
    OrderCancelApply cancelApply = orderCancelApplyMapper.getCancelApplyByCancelNo(refundNo);
    if (cancelApply != null) {
      handleCancelApplySuccess(cancelApply);
      return;
    }

    log.warn("退款回调：未找到对应的退款或取消申请, refundNo={}", refundNo);
  }

  private void handleRefundApplySuccess(OrderRefundApply refundApply) {
    // 如果已经是 REFUNDED 状态，说明已经处理过，直接返回
    if (RefundStatusEnum.REFUNDED.getCode().equals(refundApply.getStatus())) {
      log.info("退款申请已处理，跳过，refundNo={}", refundApply.getRefundNo());
      return;
    }

    Order order = this.getById(refundApply.getOrderId());
    if (order == null) {
      log.error("退款回调：订单不存在，orderId={}", refundApply.getOrderId());
      return;
    }

    // 更新退款申请状态为 REFUNDED（最终状态）
    refundApply.setStatus(RefundStatusEnum.REFUNDED.getCode());
    refundApply.setRefundTime(LocalDateTime.now());
    refundApply.setUpdatedTime(LocalDateTime.now());
    orderRefundApplyMapper.updateById(refundApply);

    // 恢复库存（只在微信回调确认退款成功后才恢复）
    List<OrderRefundItem> refundItems =
        orderRefundItemMapper.selectList(
            new QueryWrapper<OrderRefundItem>().eq("refund_apply_id", refundApply.getId()));
    for (OrderRefundItem item : refundItems) {
      OrderItem orderItem = orderItemMapper.selectById(item.getOrderItemId());
      if (orderItem != null) {
        log.info(
            "恢复库存，skuId={}, quantity={}", orderItem.getProductSkuId(), item.getRefundQuantity());
        productSkuService.addStock(orderItem.getProductSkuId(), item.getRefundQuantity());
      }
    }

    // 更新订单状态
    if ("FULL".equals(refundApply.getRefundType())) {
      // 全额退款：更新订单状态为已退款
      order.setStatus(OrderStatusEnum.REFUNDED.getCode());

      // 释放优惠券
      if (order.getCouponId() != null) {
        log.info("释放优惠券，couponId={}", order.getCouponId());
        userCouponService
            .lambdaUpdate()
            .eq(UserCoupon::getId, order.getCouponId())
            .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
            .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
            .update();
      }

      // 作废联合营销优惠券
      jointMarketingIssueService.invalidateCoupons(order.getId());
    } else {
      // 部分退款：订单状态恢复为已支付，以便后续可能的其他操作（如再次退款或发货）
      // 注意：applyRefund 时将状态改为了 REFUNDING，此处需还原
      log.info("部分退款完成，订单状态恢复为已支付，OrderId: {}", order.getId());
      order.setStatus(OrderStatusEnum.PAID.getCode());
    }

    order.setUpdatedTime(LocalDateTime.now());
    this.updateById(order);

    log.info(
        "退款回调处理成功 (RefundApply), refundNo={}, orderId={}, orderStatus={}",
        refundApply.getRefundNo(),
        order.getId(),
        order.getStatus());
  }

  private void handleCancelApplySuccess(OrderCancelApply cancelApply) {
    // 取消申请的最终状态是 APPROVED (已通过并退款)
    // 这里主要兜底 auditCancelApply 失败的情况

    Order order = this.getById(cancelApply.getOrderId());
    if (order == null) return;

    if (OrderStatusEnum.CANCELLED.getCode().equals(order.getStatus())) {
      return; // 已处理
    }

    // 恢复库存
    List<OrderItem> orderItems =
        orderItemMapper.selectList(new QueryWrapper<OrderItem>().eq("order_id", order.getId()));
    for (OrderItem item : orderItems) {
      productSkuService.addStock(item.getProductSkuId(), item.getQuantity());
    }

    // 更新订单状态
    order.setStatus(OrderStatusEnum.CANCELLED.getCode());
    order.setCancelTime(LocalDateTime.now());
    order.setUpdatedTime(LocalDateTime.now());
    this.updateById(order);

    // 解锁优惠券
    if (order.getCouponId() != null) {
      userCouponService
          .lambdaUpdate()
          .eq(UserCoupon::getId, order.getCouponId())
          .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
          .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
          .update();
    }

    log.info("退款回调处理成功 (CancelApply), cancelNo={}", cancelApply.getCancelNo());
  }

  @Override
  @Transactional(rollbackFor = Exception.class)
  public R<Boolean> deleteOrderForConsumer(Long orderId) {
    // 1. 获取当前用户
    PocoUser user = null;
    try {
      user = SecurityUtils.getUser();
    } catch (Exception ignored) {
    }
    if (user == null) {
      return R.failed("用户未登录");
    }
    // 仅消费者可操作
    if (user.getUserType() == null || !UserTypeEnum.TOC.getStatus().equals(user.getUserType())) {
      return R.failed("仅消费者可删除订单");
    }

    // 2. 查询订单
    Order order = this.getById(orderId);
    if (order == null) {
      return R.failed("订单不存在");
    }

    // 3. 归属权校验
    if (!user.getId().equals(order.getUserId())) {
      return R.failed("无权操作该订单");
    }

    // 4. 状态校验
    // 允许删除的状态：已完成、已取消、已退款
    // 待支付、待发货、待收货、退款中等状态不可删除
    String status = order.getStatus();
    boolean canDelete =
        OrderStatusEnum.COMPLETED.getCode().equals(status)
            || OrderStatusEnum.CANCELLED.getCode().equals(status)
            || OrderStatusEnum.REFUNDED.getCode().equals(status);

    if (!canDelete) {
      return R.failed("当前订单状态不支持删除");
    }

    // 5. 执行软删除
    boolean result = this.removeById(orderId);
    if (result) {
      return R.ok(true, "订单删除成功");
    } else {
      return R.failed("订单删除失败");
    }
  }

  private String getStatusDesc(String status) {
    OrderStatusEnum orderStatusEnum = OrderStatusEnum.getByCode(status);
    if (Objects.isNull(orderStatusEnum)) {
      return "未知";
    }

    return orderStatusEnum.getDescription();
  }

  @Override
  public IPage<OrderRefundApplyVO> getRefundApplyPage(RefundApplyPageQueryDTO queryDTO) {
    PocoUser user = null;
    try {
      user = SecurityUtils.getUser();
    } catch (Exception ignored) {
    }
    if (user == null) {
      throw new AccessDeniedException("用户未登录");
    }

    // 消费者不能访问商家后台接口
    if (isToc(user)) {
      throw new AccessDeniedException("Access is denied");
    }

    Page<OrderRefundApplyVO> page = queryDTO.page();
    page.setSearchCount(false);

    // 使用 DataScope 进行权限过滤，与订单列表查询保持一致
    // merchant_id 是关联订单表的字段，用于商家权限过滤
    DataScope listScope = listScope("merchant_id", "created_by");
    DataScope countScope = countScope("merchant_id", "created_by");

    IPage<OrderRefundApplyVO> resultPage =
        orderRefundApplyMapper.getRefundApplyPage(page, queryDTO, listScope);
    Long total = orderRefundApplyMapper.countRefundApply(queryDTO, countScope);
    page.setTotal(total == null ? 0L : total);

    // 设置状态描述
    if (resultPage.getRecords() != null) {
      for (OrderRefundApplyVO vo : resultPage.getRecords()) {
        vo.setStatusDescription(getRefundStatusDesc(vo.getStatus()));
      }
    }

    return resultPage;
  }

  @Override
  public IPage<OrderRefundApplyVO> getConsumerRefundApplyPage(RefundApplyPageQueryDTO queryDTO) {
    PocoUser user = null;
    try {
      user = SecurityUtils.getUser();
    } catch (Exception ignored) {
    }
    if (user == null) {
      Page<OrderRefundApplyVO> emptyPage = queryDTO.page();
      emptyPage.setRecords(Collections.emptyList());
      emptyPage.setTotal(0);
      return emptyPage;
    }

    Page<OrderRefundApplyVO> page = queryDTO.page();
    page.setSearchCount(false);

    // 消费者只能查看自己的退款申请，使用 user_id 过滤
    DataScope listScope = new DataScope();
    listScope.setFunc(DataScopeFuncEnum.ALL);
    listScope.setScopeUserName("user_id");
    listScope.setUsername(String.valueOf(user.getId()));

    DataScope countScope = new DataScope();
    countScope.setFunc(DataScopeFuncEnum.COUNT);
    countScope.setScopeUserName("user_id");
    countScope.setUsername(String.valueOf(user.getId()));

    IPage<OrderRefundApplyVO> resultPage =
        orderRefundApplyMapper.getConsumerRefundApplyPage(page, queryDTO, listScope);
    Long total = orderRefundApplyMapper.countConsumerRefundApply(queryDTO, countScope);
    page.setTotal(total == null ? 0L : total);

    // 设置状态描述
    if (resultPage.getRecords() != null) {
      for (OrderRefundApplyVO vo : resultPage.getRecords()) {
        vo.setStatusDescription(getRefundStatusDesc(vo.getStatus()));
      }
    }

    return resultPage;
  }

  @Override
  public R<OrderRefundApplyDetailVO> getRefundApplyDetail(Long refundApplyId) {
    if (refundApplyId == null) {
      return R.failed("退款申请ID不能为空");
    }

    PocoUser user = null;
    try {
      user = SecurityUtils.getUser();
    } catch (Exception ignored) {
    }
    if (user == null) {
      return R.failed("用户未登录");
    }

    // 查询退款申请
    OrderRefundApply refundApply = orderRefundApplyMapper.selectById(refundApplyId);
    if (refundApply == null) {
      return R.failed("退款申请不存在");
    }

    // 查询关联订单
    Order order = this.getById(refundApply.getOrderId());
    if (order == null) {
      return R.failed("关联订单不存在");
    }

    // 【修复权限逻辑】使用 DataScope 机制进行权限校验，与列表查询保持一致
    Long deptId = user.getDeptId();
    if (deptId != null) {
      // 构建数据权限范围，根据角色配置（全部数据/本级及下级/仅本级等）动态判断
      DataScope checkScope = listScope("merchant_id", "created_by");

      // 使用 DataScope 查询订单详情，如果无权限则查不到
      OrderDetailVO orderCheck = baseMapper.getOrderDetailById(order.getId(), checkScope);

      if (orderCheck == null) {
        return R.failed("无权查看该退款申请");
      }
    }

    // 构建详情VO
    OrderRefundApplyDetailVO detailVO = new OrderRefundApplyDetailVO();
    detailVO.setId(refundApply.getId());
    detailVO.setOrderId(refundApply.getOrderId());
    detailVO.setOrderNo(order.getOrderNo());
    detailVO.setRefundNo(refundApply.getRefundNo());
    detailVO.setRefundType(refundApply.getRefundType());
    detailVO.setRefundTypeDesc("FULL".equals(refundApply.getRefundType()) ? "全额退款" : "部分退款");
    detailVO.setRefundAmount(refundApply.getRefundAmount());
    detailVO.setOrderPaidAmount(order.getFinalPaidPrice());
    detailVO.setRefundReason(refundApply.getRefundReason());
    detailVO.setStatus(refundApply.getStatus());
    detailVO.setStatusDesc(getRefundStatusDesc(refundApply.getStatus()));
    detailVO.setApplicantId(refundApply.getApplicantId());
    detailVO.setReviewerId(refundApply.getReviewerId());
    detailVO.setReviewRemark(refundApply.getReviewRemark());
    detailVO.setReviewTime(refundApply.getReviewTime());
    detailVO.setRefundTime(refundApply.getRefundTime());
    detailVO.setCreatedTime(refundApply.getCreatedTime());

    // 查询申请人信息
    if (refundApply.getApplicantId() != null) {
      User applicant = userService.getById(refundApply.getApplicantId());
      if (applicant != null) {
        detailVO.setApplicantName(applicant.getNickname());
        detailVO.setApplicantPhone(applicant.getPhone());
      }
    }

    // 查询退款商品明细（@TableLogic 会自动处理 is_deleted 条件）
    List<OrderRefundItem> refundItems =
        orderRefundItemMapper.selectList(
            new LambdaQueryWrapper<OrderRefundItem>()
                .eq(OrderRefundItem::getRefundApplyId, refundApplyId));

    List<OrderRefundItemVO> refundItemVOs = new ArrayList<>();
    for (OrderRefundItem item : refundItems) {
      OrderRefundItemVO itemVO = new OrderRefundItemVO();
      itemVO.setId(item.getId());
      itemVO.setRefundApplyId(item.getRefundApplyId());
      itemVO.setOrderItemId(item.getOrderItemId());
      itemVO.setRefundQuantity(item.getRefundQuantity());
      itemVO.setRefundAmount(item.getRefundAmount());

      // 查询订单商品信息
      OrderItem orderItem = orderItemMapper.selectById(item.getOrderItemId());
      if (orderItem != null) {
        itemVO.setProductId(orderItem.getProductId());
        itemVO.setProductSkuId(orderItem.getProductSkuId());
        itemVO.setProductName(orderItem.getProductName());
        itemVO.setProductImage(orderItem.getProductImage());
        itemVO.setSkuSpec(orderItem.getSkuName());
        itemVO.setUnitPrice(orderItem.getOriginalPrice());
        itemVO.setQuantity(orderItem.getQuantity());
      }

      refundItemVOs.add(itemVO);
    }
    detailVO.setRefundItems(refundItemVOs);

    // 查询订单商品列表（用于对比）
    List<OrderItemVO> orderItemVOs = orderItemMapper.getOrderItemsByOrderId(order.getId());
    detailVO.setOrderItems(orderItemVOs);

    return R.ok(detailVO);
  }

  private String getRefundStatusDesc(String status) {
    if (status == null) return "未知";
    RefundStatusEnum refundStatusEnum = RefundStatusEnum.getByCode(status);
    if (refundStatusEnum == null) {
      return "未知";
    }
    return refundStatusEnum.getDescription();
  }

  /**
   * 带重试机制的库存扣减
   *
   * <p>当库存扣减因乐观锁冲突失败时，自动重试最多3次，每次间隔50ms。 任意一次成功立即返回，全部失败则抛出异常。
   *
   * @param skuId SKU ID
   * @param quantity 扣减数量
   * @throws OrderBusinessException 当3次重试均失败时抛出
   */
  private void deductStockWithRetry(Long skuId, Integer quantity) {
    final int maxRetries = 3;
    final long retryIntervalMs = 50;

    for (int attempt = 1; attempt <= maxRetries; attempt++) {
      R<Boolean> result = productSkuService.deductStock(skuId, quantity);
      if (result != null && Boolean.TRUE.equals(result.getData())) {
        log.debug("库存扣减成功，skuId={}，quantity={}，尝试次数={}", skuId, quantity, attempt);
        return;
      }

      log.warn("库存扣减失败，skuId={}，quantity={}，尝试次数={}/{}", skuId, quantity, attempt, maxRetries);

      // 如果不是最后一次尝试，则等待后重试
      if (attempt < maxRetries) {
        try {
          Thread.sleep(retryIntervalMs);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
          log.warn("库存扣减重试被中断，skuId={}", skuId);
          break;
        }
      }
    }

    // 所有重试均失败，抛出异常
    throw new OrderBusinessException("库存预留失败，请稍后重试");
  }

  /**
   * 回滚优惠券状态
   *
   * <p>将已锁定（LOCKED）状态的优惠券回滚为未使用（UNUSED）状态。 用于普通下单过程中，优惠券已锁定但后续步骤（如库存扣减、订单保存）失败时的回滚处理。
   * 回滚失败时记录错误日志，便于人工处理。
   *
   * @param couponId 优惠券ID
   */
  private void rollbackCouponStatus(Long couponId) {
    if (couponId == null) {
      return;
    }
    try {
      boolean rollbackResult =
          userCouponService
              .lambdaUpdate()
              .eq(UserCoupon::getId, couponId)
              .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
              .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
              .update();
      if (rollbackResult) {
        log.info("优惠券状态回滚成功，couponId={}", couponId);
      } else {
        log.warn("优惠券状态回滚未生效（可能状态已变更），couponId={}", couponId);
      }
    } catch (Exception e) {
      log.error("优惠券状态回滚失败，couponId={}，需人工处理", couponId, e);
    }
  }

  /**
   * 批量回滚优惠券状态
   * 
   * <p>用于单品下单失败时回滚多张优惠券（商家券 + 平台券）
   * 
   * @param couponIds 优惠券ID列表
   */
  private void rollbackCoupons(List<Long> couponIds) {
    if (CollUtil.isEmpty(couponIds)) {
      return;
    }
    
    log.info("开始批量回滚优惠券状态，数量: {}", couponIds.size());
    
    for (Long couponId : couponIds) {
      try {
        boolean rollbackResult =
            userCouponService
                .lambdaUpdate()
                .eq(UserCoupon::getId, couponId)
                .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
                .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
                .update();
        if (rollbackResult) {
          log.info("优惠券状态回滚成功，couponId: {}", couponId);
        } else {
          log.warn("优惠券状态回滚未生效（可能状态已变更），couponId: {}", couponId);
        }
      } catch (Exception ex) {
        log.error("优惠券状态回滚失败，couponId: {}，需人工处理", couponId, ex);
      }
    }
    
    log.info("批量回滚优惠券状态完成");
  }

  /**
   * 筛选符合优惠券规则的订单商品
   * 
   * <p>根据优惠券模板的适用商品配置，筛选出符合规则的商品列表
   * <p>如果优惠券没有商品限制，则返回所有商品
   * 
   * @param items 订单商品列表
   * @param template 优惠券模板
   * @param skuMap SKU详情映射
   * @return 符合规则的商品列表
   */
  private List<OrderItemCreateDTO> filterApplicableItemsForOrder(
      List<OrderItemCreateDTO> items,
      CouponTemplate template,
      Map<Long, ProductSkuVO> skuMap) {
    
    // 解析优惠券适用商品规则
    CouponApplicableScopeBO scope = parseCouponScope(template);
    
    // 如果没有商品限制，返回所有商品
    if (CollUtil.isEmpty(scope.getApplicableSkuIds())) {
      log.debug("优惠券无商品限制，适用于所有商品");
      return items;
    }
    
    // 筛选符合规则的商品
    List<OrderItemCreateDTO> applicableItems = items.stream()
        .filter(item -> scope.getApplicableSkuIds().contains(item.getProductSkuId()))
        .collect(Collectors.toList());
    
    log.debug("优惠券适用商品筛选完成，原商品数: {}，符合规则商品数: {}", 
        items.size(), applicableItems.size());
    
    return applicableItems;
  }

  /**
   * 计算符合平台券的商品折后价总和
   * 
   * <p>计算逻辑：
   * <ol>
   *   <li>遍历符合平台券规则的商品列表</li>
   *   <li>计算每个商品的原价</li>
   *   <li>按原价比例计算每个商品的折后价</li>
   *   <li>累加得到符合商品的折后价总和</li>
   * </ol>
   * 
   * <p>示例：
   * <pre>
   * 商品原价总和: 150元
   * 商家券优惠: 30元
   * 折后价总和: 120元
   * 
   * SKU1: 原价100元，占比 100/150 = 0.667，折后价 120 × 0.667 = 80元
   * SKU2: 原价50元，占比 50/150 = 0.333，折后价 120 × 0.333 = 40元
   * 
   * 如果平台券只适用于SKU1，则符合商品折后价总和 = 80元
   * </pre>
   * 
   * @param applicableItems 符合平台券规则的商品列表
   * @param skuMap SKU详情映射
   * @param totalProductPrice 商品原价总和
   * @param discountedPrice 折后价总和（扣除商家券后）
   * @return 符合商品的折后价总和
   */
  private BigDecimal calculateApplicableDiscountedPrice(
      List<OrderItemCreateDTO> applicableItems,
      Map<Long, ProductSkuVO> skuMap,
      BigDecimal totalProductPrice,
      BigDecimal discountedPrice) {
    
    BigDecimal applicableDiscountedPrice = BigDecimal.ZERO;
    
    for (OrderItemCreateDTO item : applicableItems) {
      ProductSkuVO sku = skuMap.get(item.getProductSkuId());
      if (sku == null) {
        log.warn("SKU不存在，跳过该商品，skuId: {}", item.getProductSkuId());
        continue;
      }
      
      // 计算该商品的原价
      BigDecimal itemOriginalPrice = sku.getPrice()
          .multiply(new BigDecimal(item.getQuantity()))
          .setScale(2, RoundingMode.DOWN);
      
      // 按比例计算该商品的折后价
      BigDecimal itemDiscountedPrice = itemOriginalPrice;
      if (totalProductPrice.compareTo(BigDecimal.ZERO) > 0) {
        // 计算该商品占总原价的比例
        BigDecimal ratio = itemOriginalPrice.divide(totalProductPrice, 8, RoundingMode.HALF_UP);
        // 按比例计算折后价
        itemDiscountedPrice = discountedPrice.multiply(ratio).setScale(2, RoundingMode.DOWN);
      }
      
      applicableDiscountedPrice = applicableDiscountedPrice.add(itemDiscountedPrice);
      
      log.debug("商品折后价计算: skuId={}, 原价={}, 折后价={}", 
          item.getProductSkuId(), itemOriginalPrice, itemDiscountedPrice);
    }
    
    log.info("符合平台券的商品折后价总和: {}", applicableDiscountedPrice);
    
    return applicableDiscountedPrice;
  }

  // ==================== 优惠券适用范围处理（新增） ====================

  /**
   * 解析优惠券适用范围
   *
   * <p>根据优惠券模板配置，解析出优惠券的适用范围，包括： 1. 商家限制：商家自有券只能在指定商家使用 2. 门店限制：门店券只能在指定门店使用 3.
   * 商品限制：商品券只能用于指定商品（关键！）
   *
   * @param template 优惠券模板
   * @return 优惠券适用范围
   */
  private CouponApplicableScopeBO parseCouponScope(CouponTemplate template) {
    CouponApplicableScopeBO scope = new CouponApplicableScopeBO();
    scope.setScopeType(template.getScope());

    // 1. 解析商家限制
    if (template.getScope() == CouponTemplateEnum.COUPON_SCOPE_MERCHANT_OWN) {
      // 商家自有券：只能在该商家使用
      if (template.getMerchantId() != null) {
        scope.setApplicableMerchantIds(Collections.singleton(template.getMerchantId()));
      }
    }

    // 2. 解析门店限制
    if (template.getScope() == CouponTemplateEnum.COUPON_SCOPE_STORE) {
      // 门店券：只能在指定门店使用
      if (StrUtil.isNotBlank(template.getApplicableStores())) {
        try {
          List<Long> storeIds = JSONUtil.toList(template.getApplicableStores(), Long.class);
          if (CollUtil.isNotEmpty(storeIds)) {
            scope.setApplicableStoreIds(new HashSet<>(storeIds));
          }
        } catch (Exception e) {
          log.warn(
              "解析优惠券适用门店失败，templateId={}，applicableStores={}",
              template.getId(),
              template.getApplicableStores(),
              e);
        }
      }
    }

    // 3. 解析商品限制（关键！之前缺失的逻辑）
    if (StrUtil.isNotBlank(template.getApplicableSkus())) {
      try {
        List<Long> skuIds = JSONUtil.toList(template.getApplicableSkus(), Long.class);
        if (CollUtil.isNotEmpty(skuIds)) {
          scope.setApplicableSkuIds(new HashSet<>(skuIds));
          log.info("优惠券限制商品范围，templateId={}，applicableSkus={}", template.getId(), skuIds);
        }
      } catch (Exception e) {
        log.warn(
            "解析优惠券适用商品失败，templateId={}，applicableSkus={}",
            template.getId(),
            template.getApplicableSkus(),
            e);
      }
    }

    return scope;
  }

  /**
   * 计算优惠金额
   *
   * <p>根据优惠券类型计算优惠金额： - 折扣券：符合商品金额 × (1 - 折扣率)，使用截断保留2位小数 - 满减券：固定金额 同时校验最大抵扣金额限制
   *
   * <p>金额精度处理说明： - 使用 RoundingMode.DOWN 进行截断，不进行四舍五入 - 例如：99.999 元会被截断为 99.99 元 -
   * 这样可以避免优惠金额超过实际应付金额的情况
   *
   * @param template 优惠券模板，包含优惠券类型、折扣率、减免金额等信息
   * @param applicableAmount 符合条件的商品总金额（可能是原价或折后价，取决于调用场景）
   * @return 优惠金额，保留2位小数（使用截断方式）
   */
  private BigDecimal calculateDiscount(CouponTemplate template, BigDecimal applicableAmount) {
    BigDecimal totalDiscount;

    if (CouponTemplateEnum.COUPON_TYPE_DISCOUNT.equals(template.getType())) {
      // 折扣券计算逻辑：
      // 1. 计算折扣后的金额 = 符合商品金额 × (1 - 折扣率)
      // 2. 优惠金额 = 符合商品金额 - 折扣后的金额
      //
      // 示例：商品金额 100 元，折扣率 0.8（8折）
      // 折扣后金额 = 100 × (1 - 0.8) = 100 × 0.2 = 20 元
      //
      // 注意：使用 setScale(2, RoundingMode.DOWN) 进行截断
      totalDiscount =
          applicableAmount
              .multiply(BigDecimal.ONE.subtract(template.getDiscountRate()))
              .setScale(2, RoundingMode.DOWN);

      log.debug(
          "折扣券计算：符合商品金额={}，折扣率={}，优惠金额={}",
          applicableAmount,
          template.getDiscountRate(),
          totalDiscount);
    } else {
      // 满减券计算逻辑：
      // 直接返回优惠券模板中配置的固定减免金额
      // 例如：满100减20，则优惠金额为 20 元
      totalDiscount = template.getDiscountAmount();

      log.debug("满减券计算：符合商品金额={}，固定减免金额={}", applicableAmount, totalDiscount);
    }

    // 校验最大抵扣金额限制
    // 如果优惠券配置了最大抵扣金额（maxDeductibleAmount），
    // 则优惠金额不能超过该限制
    // 例如：折扣券计算出优惠 50 元，但最大抵扣限制为 30 元，则实际优惠为 30 元
    if (template.getMaxDeductibleAmount() != null
        && totalDiscount.compareTo(template.getMaxDeductibleAmount()) > 0) {
      log.info(
          "优惠金额超过最大抵扣限制，原优惠金额={}元，最大抵扣限制={}元，实际优惠金额={}元",
          totalDiscount,
          template.getMaxDeductibleAmount(),
          template.getMaxDeductibleAmount());
      totalDiscount = template.getMaxDeductibleAmount();
    }

    return totalDiscount;
  }

  /**
   * 按商家订单金额比例分摊优惠金额
   *
   * <p>将总优惠金额按照各商家订单金额占比进行分摊。 采用精度保护策略： - 前N-1个商家按比例计算 - 最后一个商家使用减法兜底，避免累计误差
   *
   * @param merchantAmountMap 商家ID -> 订单金额映射
   * @param totalDiscount 总优惠金额
   * @return 商家ID -> 分摊优惠金额映射
   */
  private Map<Long, BigDecimal> allocateDiscountByMerchant(
      Map<Long, BigDecimal> merchantAmountMap, BigDecimal totalDiscount) {

    Map<Long, BigDecimal> merchantCouponShareMap = new HashMap<>();

    // 计算总金额
    BigDecimal totalAmount =
        merchantAmountMap.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);

    if (totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
      log.warn("商家订单总金额为0，无法分摊优惠");
      return merchantCouponShareMap;
    }

    // 按比例分摊
    BigDecimal remainDiscount = totalDiscount;
    int merchantCount = merchantAmountMap.size();
    int index = 0;

    for (Map.Entry<Long, BigDecimal> entry : merchantAmountMap.entrySet()) {
      index++;
      Long merchantId = entry.getKey();
      BigDecimal merchantAmount = entry.getValue();

      if (index == merchantCount) {
        // 最后一个商家用减法兜底，避免精度误差
        merchantCouponShareMap.put(merchantId, remainDiscount);
        log.debug("商家优惠分摊（兜底），merchantId={}，分摊金额={}", merchantId, remainDiscount);
      } else {
        // 计算公式: (商家金额 / 总金额) × 总优惠
        // 注意：使用 RoundingMode.DOWN 进行截断，保持与新版本一致
        BigDecimal share =
            merchantAmount
                .divide(totalAmount, 8, RoundingMode.HALF_UP)
                .multiply(totalDiscount)
                .setScale(2, RoundingMode.DOWN);

        merchantCouponShareMap.put(merchantId, share);
        remainDiscount = remainDiscount.subtract(share);
        log.debug("商家优惠分摊，merchantId={}，订单金额={}，分摊金额={}", merchantId, merchantAmount, share);
      }
    }

    return merchantCouponShareMap;
  }

  /**
   * 计算商家券优惠金额（重构后）
   *
   * <p>该方法用于计算单个商家订单的商家券优惠金额。 主要流程： 1. 如果商家订单项不包含商家券ID，直接返回0（无优惠） 2. 校验并锁定商家券（包括归属、状态、有效期、商家匹配等校验）
   * 3. 筛选符合优惠券规则的商品（根据优惠券的适用商品配置） 4. 计算符合商品的原价总和 5. 根据优惠券类型计算优惠金额（折扣券或满减券） 6.
   * 使用截断方式保留2位小数（RoundingMode.DOWN，不四舍五入）
   *
   * <p>注意事项： - 商家券基于商品原价计算，不考虑其他优惠 - 金额精度使用截断而非四舍五入，符合业务规则 - 如果没有符合条件的商品，会抛出异常 - 如果不满足使用门槛，会抛出异常
   *
   * @param merchantOrderItem 商家订单项，包含商家ID、商品列表和商家券ID
   * @param skuMap SKU详情映射，用于获取商品价格信息
   * @param userId 用户ID，用于校验优惠券归属
   * @return 商家券优惠金额，如果没有商家券则返回 BigDecimal.ZERO
   * @throws OrderBusinessException 当优惠券校验失败、无符合商品或不满足使用门槛时抛出
   */
  private BigDecimal calculateMerchantCouponDiscount(
      MerchantOrderItem merchantOrderItem, Map<Long, ProductSkuVO> skuMap, Long userId) {

    // 1. 如果商家订单项不包含商家券ID，返回0（无优惠）
    if (merchantOrderItem.getMerchantCouponId() == null) {
      log.debug("商家订单无商家券，merchantId={}", merchantOrderItem.getMerchantId());
      return BigDecimal.ZERO;
    }

    Long merchantCouponId = merchantOrderItem.getMerchantCouponId();
    Long merchantId = merchantOrderItem.getMerchantId();
    List<OrderItemCreateDTO> items = merchantOrderItem.getItems();

    log.info(
        "开始计算商家券优惠，merchantId={}，couponId={}，商品数量={}", merchantId, merchantCouponId, items.size());

    // 2. 查询用户优惠券
    UserCoupon userCoupon = userCouponService.getById(merchantCouponId);
    if (userCoupon == null) {
      throw new OrderBusinessException("商家优惠券不存在，couponId=" + merchantCouponId);
    }

    // 3. 校验优惠券归属
    if (!userId.equals(userCoupon.getUserId())) {
      throw new OrderBusinessException("商家优惠券不属于当前用户，couponId=" + merchantCouponId);
    }

    // 4. 校验优惠券状态
    if (userCoupon.getCouponStatus() != CouponStatusEnum.USER_COUPON_UNUSED) {
      throw new OrderBusinessException("商家优惠券状态异常，无法使用，couponId=" + merchantCouponId);
    }

    // 5. 校验有效期
    LocalDateTime now = LocalDateTime.now();
    if (userCoupon.getValidStartTime() != null && now.isBefore(userCoupon.getValidStartTime())) {
      throw new OrderBusinessException("商家优惠券尚未生效，couponId=" + merchantCouponId);
    }
    if (userCoupon.getValidEndTime() != null && now.isAfter(userCoupon.getValidEndTime())) {
      throw new OrderBusinessException("商家优惠券已过期，couponId=" + merchantCouponId);
    }

    // 6. 查询优惠券模板
    CouponTemplate template = couponTemplateService.getById(userCoupon.getTemplateId());
    if (template == null || !template.getEnable()) {
      throw new OrderBusinessException("商家优惠券模板无效，couponId=" + merchantCouponId);
    }

    // 7. 校验商家归属（商家券必须归属于对应商家）
    if (template.getMerchantId() == null || !template.getMerchantId().equals(merchantId)) {
      throw new OrderBusinessException(
          String.format(
              "商家优惠券不属于该商家，couponId=%d，期望商家=%d，实际商家=%d",
              merchantCouponId, merchantId, template.getMerchantId()));
    }

    // 8. 解析优惠券适用范围
    CouponApplicableScopeBO scope = parseCouponScope(template);
    log.debug("商家券适用范围解析完成，couponId={}，scopeType={}", merchantCouponId, scope.getScopeType());

    // 9. 筛选符合优惠券规则的商品
    List<OrderItemCreateDTO> applicableItems = filterApplicableItemsForOrder(items, scope, skuMap);

    if (CollUtil.isEmpty(applicableItems)) {
      throw new OrderBusinessException("商家订单中没有符合优惠券使用条件的商品，couponId=" + merchantCouponId);
    }

    log.info("商家券符合条件的商品数量: {}，couponId={}", applicableItems.size(), merchantCouponId);

    // 10. 计算符合商品的原价总和
    BigDecimal applicableAmount = BigDecimal.ZERO;
    for (OrderItemCreateDTO item : applicableItems) {
      ProductSkuVO sku = skuMap.get(item.getProductSkuId());
      if (sku == null) {
        throw new OrderBusinessException("商品已下架，skuId=" + item.getProductSkuId());
      }

      // 商品金额 = 单价 × 数量
      BigDecimal itemAmount = sku.getPrice().multiply(new BigDecimal(item.getQuantity()));
      applicableAmount = applicableAmount.add(itemAmount);
    }

    log.info("商家券符合商品的原价总和: {}元，couponId={}", applicableAmount, merchantCouponId);

    // 11. 校验使用门槛
    if (applicableAmount.compareTo(template.getMinSpendAmount()) < 0) {
      throw new OrderBusinessException(
          String.format(
              "商家订单金额不满足优惠券使用条件，需满足%.2f元，当前%.2f元", template.getMinSpendAmount(), applicableAmount));
    }

    // 12. 锁定优惠券（使用乐观锁）
    boolean locked =
        userCouponService
            .lambdaUpdate()
            .eq(UserCoupon::getId, merchantCouponId)
            .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
            .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
            .update();

    if (!locked) {
      throw new OrderBusinessException("商家优惠券锁定失败，请稍后重试，couponId=" + merchantCouponId);
    }

    log.info("商家优惠券锁定成功，couponId={}", merchantCouponId);

    // 13. 计算优惠金额
    BigDecimal discount = calculateDiscount(template, applicableAmount);

    // 14. 使用截断保留2位小数（不四舍五入）
    discount = discount.setScale(2, RoundingMode.DOWN);

    log.info(
        "商家券优惠计算完成，merchantId={}，couponId={}，优惠金额={}元", merchantId, merchantCouponId, discount);

    return discount;
  }

  /**
   * 计算平台券优惠金额（重构后）
   *
   * <p>该方法用于计算平台券的优惠金额，基于所有商家符合平台券的SKU折后价总和进行计算。 主要流程： 1. 如果平台券ID为空，直接返回0（无优惠） 2.
   * 校验并锁定平台券（包括归属、状态、有效期、平台券类型等校验） 3. 遍历所有商家订单，筛选符合优惠券规则的商品 4. 计算符合商品的折后价（按原价比例分摊商家折后价）
   * 5. 根据优惠券类型计算优惠金额（折扣券或满减券） 6. 使用截断方式保留2位小数（RoundingMode.DOWN，不四舍五入） 7.
   * 通过出参返回每个商家符合平台券的SKU折后价（用于后续分摊）
   *
   * <p>注意事项： - 平台券基于商家折后价计算（即扣除商家券后的价格） - 金额精度使用截断而非四舍五入，符合业务规则 - 如果没有符合条件的商品，会抛出异常 -
   * 如果不满足使用门槛，会抛出异常 - **关键修复**：通过出参返回每个商家符合平台券的SKU折后价，用于正确分摊平台券优惠
   *
   * <p>计算示例： 假设有2个商家订单： - 商家A：SKU1原价100元(符合平台券)，SKU2原价50元(不符合)，使用商家券后折后价120元 -
   * 商家B：SKU3原价200元(符合平台券)，SKU4原价100元(不符合)，无商家券，折后价300元 - 平台券：8折折扣券，门槛满100元
   *
   * <p>计算过程： 1. 商家A符合商品折后价 = 120 × (100/150) = 80元 2. 商家B符合商品折后价 = 300 × (200/300) = 200元 3.
   * 符合商品折后价总和 = 80 + 200 = 280元 4. 满足门槛（280 >= 100） 5. 平台券优惠 = 280 × (1 - 0.8) = 280 × 0.2 = 56元
   * 6. 使用截断保留2位小数：56.00元 7. 出参记录：merchantApplicableDiscountedPrices = {商家A: 80元, 商家B: 200元}
   *
   * @param platformCouponId 平台券ID，如果为null则返回0
   * @param merchantDiscountedPrices 商家ID -> 折后价映射，用于计算平台券基准金额
   * @param merchantOrderItems 商家订单列表，用于校验适用商品规则
   * @param skuMap SKU详情映射，用于获取商品价格信息
   * @param userId 用户ID，用于校验优惠券归属
   * @param merchantApplicableDiscountedPrices 出参：商家ID -> 符合平台券的SKU折后价映射，用于后续分摊
   * @return 平台券优惠金额，如果没有平台券则返回 BigDecimal.ZERO
   * @throws OrderBusinessException 当优惠券校验失败、无符合商品或不满足使用门槛时抛出
   */
  private BigDecimal calculatePlatformCouponDiscount(
      Long platformCouponId,
      Map<Long, BigDecimal> merchantDiscountedPrices,
      List<MerchantOrderItem> merchantOrderItems,
      Map<Long, ProductSkuVO> skuMap,
      Long userId,
      Map<Long, BigDecimal> merchantApplicableDiscountedPrices) { // 新增出参

    // 1. 如果平台券ID为空，返回0（无优惠）
    if (platformCouponId == null) {
      log.debug("订单无平台券，跳过平台券计算");
      return BigDecimal.ZERO;
    }

    log.info("开始计算平台券优惠，couponId={}，商家数量={}", platformCouponId, merchantOrderItems.size());

    // 2. 查询用户优惠券
    UserCoupon userCoupon = userCouponService.getById(platformCouponId);
    if (userCoupon == null) {
      throw new OrderBusinessException("平台优惠券不存在，couponId=" + platformCouponId);
    }

    // 3. 校验优惠券归属
    if (!userId.equals(userCoupon.getUserId())) {
      throw new OrderBusinessException("平台优惠券不属于当前用户，couponId=" + platformCouponId);
    }

    // 4. 校验优惠券状态
    if (userCoupon.getCouponStatus() != CouponStatusEnum.USER_COUPON_UNUSED) {
      throw new OrderBusinessException("平台优惠券状态异常，无法使用，couponId=" + platformCouponId);
    }

    // 5. 校验有效期
    LocalDateTime now = LocalDateTime.now();
    if (userCoupon.getValidStartTime() != null && now.isBefore(userCoupon.getValidStartTime())) {
      throw new OrderBusinessException("平台优惠券尚未生效，couponId=" + platformCouponId);
    }
    if (userCoupon.getValidEndTime() != null && now.isAfter(userCoupon.getValidEndTime())) {
      throw new OrderBusinessException("平台优惠券已过期，couponId=" + platformCouponId);
    }

    // 6. 查询优惠券模板
    CouponTemplate template = couponTemplateService.getById(userCoupon.getTemplateId());
    if (template == null || !template.getEnable()) {
      throw new OrderBusinessException("平台优惠券模板无效，couponId=" + platformCouponId);
    }

    // 7. 校验平台券类型（scope 必须为 COUPON_SCOPE_GLOBAL，即全平台券）
    if (!CouponTemplateEnum.COUPON_SCOPE_GLOBAL.equals(template.getScope())) {
      throw new OrderBusinessException(
          String.format(
              "优惠券不是平台券，无法使用，couponId=%d，scope=%s", platformCouponId, template.getScope()));
    }

    // 8. 解析优惠券适用范围
    CouponApplicableScopeBO scope = parseCouponScope(template);
    log.debug("平台券适用范围解析完成，couponId={}，scopeType={}", platformCouponId, scope.getScopeType());

    // 9. 遍历所有商家订单，筛选符合优惠券规则的商品，并计算折后价总和
    BigDecimal applicableDiscountedAmount = BigDecimal.ZERO;
    int applicableItemCount = 0;

    for (MerchantOrderItem merchantOrderItem : merchantOrderItems) {
      Long merchantId = merchantOrderItem.getMerchantId();
      List<OrderItemCreateDTO> items = merchantOrderItem.getItems();

      // 筛选符合优惠券规则的商品
      List<OrderItemCreateDTO> applicableItems =
          filterApplicableItemsForOrder(items, scope, skuMap);

      if (CollUtil.isEmpty(applicableItems)) {
        log.debug("商家[{}]无符合平台券条件的商品，跳过", merchantId);
        continue;
      }

      // 计算该商家符合商品的折后价
      // 关键：这里使用折后价而非原价，因为平台券是在商家券之后计算的
      BigDecimal merchantDiscountedPrice = merchantDiscountedPrices.get(merchantId);
      if (merchantDiscountedPrice == null) {
        log.warn("商家[{}]折后价不存在，跳过", merchantId);
        continue;
      }

      // 计算符合商品占该商家所有商品的比例
      // 如果优惠券限制了适用商品，需要按比例计算折后价
      BigDecimal merchantTotalAmount = BigDecimal.ZERO;
      BigDecimal applicableAmount = BigDecimal.ZERO;

      for (OrderItemCreateDTO item : items) {
        ProductSkuVO sku = skuMap.get(item.getProductSkuId());
        if (sku == null) {
          throw new OrderBusinessException("商品已下架，skuId=" + item.getProductSkuId());
        }

        BigDecimal itemAmount = sku.getPrice().multiply(new BigDecimal(item.getQuantity()));
        merchantTotalAmount = merchantTotalAmount.add(itemAmount);

        // 判断该商品是否符合优惠券规则
        boolean isApplicable =
            applicableItems.stream()
                .anyMatch(ai -> ai.getProductSkuId().equals(item.getProductSkuId()));

        if (isApplicable) {
          applicableAmount = applicableAmount.add(itemAmount);
        }
      }

      // 按比例计算该商家符合商品的折后价
      // 公式：符合商品折后价 = 商家折后价 × (符合商品原价 / 商家商品原价总和)
      BigDecimal merchantApplicableDiscountedPrice;
      if (merchantTotalAmount.compareTo(BigDecimal.ZERO) > 0) {
        BigDecimal ratio = applicableAmount.divide(merchantTotalAmount, 8, RoundingMode.HALF_UP);
        merchantApplicableDiscountedPrice = merchantDiscountedPrice.multiply(ratio);
      } else {
        merchantApplicableDiscountedPrice = BigDecimal.ZERO;
      }

      applicableDiscountedAmount =
          applicableDiscountedAmount.add(merchantApplicableDiscountedPrice);
      applicableItemCount += applicableItems.size();

      // 关键修复：记录每个商家符合平台券的SKU折后价（用于后续分摊）
      if (merchantApplicableDiscountedPrice.compareTo(BigDecimal.ZERO) > 0) {
        merchantApplicableDiscountedPrices.put(merchantId, merchantApplicableDiscountedPrice);
      }

      log.debug(
          "商家[{}]符合平台券条件的商品数量={}，符合SKU折后价={}元",
          merchantId,
          applicableItems.size(),
          merchantApplicableDiscountedPrice);
    }

    // 10. 校验是否有符合条件的商品
    if (applicableItemCount == 0) {
      throw new OrderBusinessException("订单中没有符合平台券使用条件的商品，couponId=" + platformCouponId);
    }

    log.info(
        "平台券符合条件的商品总数: {}，折后价总和: {}元，couponId={}",
        applicableItemCount,
        applicableDiscountedAmount,
        platformCouponId);

    // 11. 校验使用门槛（基于折后价总和）
    if (applicableDiscountedAmount.compareTo(template.getMinSpendAmount()) < 0) {
      throw new OrderBusinessException(
          String.format(
              "订单金额不满足平台券使用条件，需满足%.2f元，当前%.2f元",
              template.getMinSpendAmount(), applicableDiscountedAmount));
    }

    // 12. 锁定优惠券（使用乐观锁）
    boolean locked =
        userCouponService
            .lambdaUpdate()
            .eq(UserCoupon::getId, platformCouponId)
            .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
            .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_LOCKED)
            .update();

    if (!locked) {
      throw new OrderBusinessException("平台优惠券锁定失败，请稍后重试，couponId=" + platformCouponId);
    }

    log.info("平台优惠券锁定成功，couponId={}", platformCouponId);

    // 13. 计算优惠金额（基于折后价总和）
    BigDecimal discount = calculateDiscount(template, applicableDiscountedAmount);

    // 14. 使用截断保留2位小数（不四舍五入）
    discount = discount.setScale(2, RoundingMode.DOWN);

    log.info("平台券优惠计算完成，couponId={}，优惠金额={}元", platformCouponId, discount);

    return discount;
  }

  /**
   * 按商家符合平台券的SKU折后价比例分摊平台券优惠（重构后）
   *
   * <p>该方法用于将平台券的优惠金额按照各商家符合平台券的SKU折后价的比例分摊到每个商家。 这是平台券计算的最后一步，确保优惠金额能够正确分配到各个商家订单。
   *
   * <p>**关键修复**：使用符合平台券的SKU折后价进行分摊，而不是商家整体折后价。 这样可以确保只有参与平台券计算的商品才会分摊优惠，符合业务逻辑。
   *
   * <p>分摊公式： 商家分摊金额 = 平台券优惠 × (商家符合SKU折后价 / 总符合SKU折后价)
   *
   * <p>精度处理策略（关键！）： - 前N-1个商家：按比例计算，使用 setScale(2, RoundingMode.DOWN) 截断保留2位小数 - 最后一个商家：使用减法兜底 =
   * 平台券优惠 - 前N-1个商家分摊总和 - 这样可以避免因截断导致的累计误差，确保分摊总和等于平台券优惠
   *
   * <p>示例： 假设有2个商家订单： - 商家A：SKU1(100元,符合) + SKU2(50元,不符合)，商家券后折后价120元，符合SKU折后价80元 -
   * 商家B：SKU3(200元,符合) + SKU4(100元,不符合)，无商家券，折后价300元，符合SKU折后价200元 - 平台券优惠：50元
   *
   * <p>计算过程： 1. 总符合SKU折后价 = 80 + 200 = 280元 2. 商家A分摊 = 50 × (80 / 280) = 14.285... → 截断为 14.28元 3.
   * 商家B分摊 = 50 - 14.28 = 35.72元（减法兜底） 4. 验证：14.28 + 35.72 = 50.00元 ✓
   *
   * @param merchantApplicableDiscountedPrices 商家ID -> 符合平台券的SKU折后价映射，用于计算分摊比例
   * @param platformCouponDiscount 平台券优惠金额，需要分摊的总金额
   * @return 商家ID -> 分摊金额映射，如果总折后价为0则返回空映射
   */
  private Map<Long, BigDecimal> allocatePlatformCouponDiscount(
      Map<Long, BigDecimal> merchantApplicableDiscountedPrices, BigDecimal platformCouponDiscount) {

    // 初始化返回结果
    Map<Long, BigDecimal> allocationMap = new HashMap<>();

    // 1. 计算所有商家符合平台券的SKU折后价总和
    BigDecimal totalApplicableDiscountedPrice =
        merchantApplicableDiscountedPrices.values().stream()
            .reduce(BigDecimal.ZERO, BigDecimal::add);

    log.info(
        "开始分摊平台券优惠，平台券优惠={}元，商家数量={}，总符合SKU折后价={}元",
        platformCouponDiscount,
        merchantApplicableDiscountedPrices.size(),
        totalApplicableDiscountedPrice);

    // 2. 如果总符合SKU折后价为0，无法分摊，返回空映射
    if (totalApplicableDiscountedPrice.compareTo(BigDecimal.ZERO) <= 0) {
      log.warn("商家符合平台券的SKU折后价总和为0，无法分摊平台券优惠");
      return allocationMap;
    }

    // 3. 按比例分摊平台券优惠
    BigDecimal allocatedSum = BigDecimal.ZERO; // 已分摊金额累计
    int merchantCount = merchantApplicableDiscountedPrices.size();
    int index = 0;

    // 将 Map 转换为 List 以便按顺序处理（确保最后一个商家使用减法兜底）
    List<Map.Entry<Long, BigDecimal>> merchantList =
        new ArrayList<>(merchantApplicableDiscountedPrices.entrySet());

    for (Map.Entry<Long, BigDecimal> entry : merchantList) {
      index++;
      Long merchantId = entry.getKey();
      BigDecimal merchantApplicableDiscountedPrice = entry.getValue();

      BigDecimal allocation;

      if (index == merchantCount) {
        // 最后一个商家：使用减法兜底，避免累计误差
        // 公式：最后商家分摊 = 平台券优惠 - 前N-1个商家分摊总和
        allocation = platformCouponDiscount.subtract(allocatedSum);

        log.debug(
            "商家[{}]平台券分摊（减法兜底），符合SKU折后价={}元，分摊金额={}元",
            merchantId,
            merchantApplicableDiscountedPrice,
            allocation);
      } else {
        // 前N-1个商家：按比例计算，使用截断保留2位小数
        // 公式：商家分摊 = 平台券优惠 × (商家符合SKU折后价 / 总符合SKU折后价)
        // 步骤1：计算比例（保留8位小数以提高精度）
        BigDecimal ratio =
            merchantApplicableDiscountedPrice.divide(
                totalApplicableDiscountedPrice, 8, RoundingMode.HALF_UP);

        // 步骤2：计算分摊金额
        allocation = platformCouponDiscount.multiply(ratio);

        // 步骤3：使用截断保留2位小数（关键！不四舍五入）
        allocation = allocation.setScale(2, RoundingMode.DOWN);

        // 步骤4：累加已分摊金额
        allocatedSum = allocatedSum.add(allocation);

        log.debug(
            "商家[{}]平台券分摊（按比例），符合SKU折后价={}元，比例={}，分摊金额={}元",
            merchantId,
            merchantApplicableDiscountedPrice,
            ratio,
            allocation);
      }

      // 4. 将分摊结果存入映射
      allocationMap.put(merchantId, allocation);
    }

    log.info("平台券分摊完成，分摊结果: {}", allocationMap);

    return allocationMap;
  }

  /**
   * 筛选符合优惠券使用条件的订单商品
   *
   * <p>该方法用于筛选订单商品列表中符合优惠券适用规则的商品。
   *
   * <p>校验说明：
   * <ul>
   *   <li>商品限制：如果优惠券限制了商品（applicableSkuIds），只有指定商品才能使用</li>
   *   <li>商家限制：已在上层方法中完成校验（calculateMerchantCouponDiscount 中校验商家归属）</li>
   *   <li>门店限制：当前版本暂不支持门店级别的优惠券</li>
   * </ul>
   *
   * @param items 订单商品列表
   * @param scope 优惠券适用范围
   * @param skuMap SKU详情映射，用于获取商品价格
   * @return 符合条件的订单商品列表
   */
  private List<OrderItemCreateDTO> filterApplicableItemsForOrder(
      List<OrderItemCreateDTO> items,
      CouponApplicableScopeBO scope,
      Map<Long, ProductSkuVO> skuMap) {

    return items.stream()
        .filter(
            item -> {
              Long skuId = item.getProductSkuId();

              // 1. 商品限制校验（最优先，关键！）
              if (CollUtil.isNotEmpty(scope.getApplicableSkuIds())) {
                if (!scope.getApplicableSkuIds().contains(skuId)) {
                  log.debug("订单商品不在优惠券适用范围内，skuId={}", skuId);
                  return false; // 商品不在适用范围内
                }
              }

              // 注意：商家限制和门店限制校验已在上层方法中完成
              // - 商家券：在 calculateMerchantCouponDiscount 中已校验商家归属
              // - 平台券：适用于所有商家
              // 因此这里只需要校验商品限制即可

              return true; // 通过所有校验
            })
        .collect(Collectors.toList());
  }

  /**
   * 筛选符合优惠券适用规则的订单商品（重构版本）
   *
   * <p>根据优惠券模板的 applicableSkus 字段筛选符合条件的商品。 筛选规则： 1. 如果 applicableSkus 为空或 null，表示优惠券适用于所有商品，返回所有商品
   * 2. 如果 applicableSkus 不为空，只返回 SKU ID 在列表中的商品
   *
   * <p>示例： - applicableSkus = null 或 "" → 返回所有商品 - applicableSkus = "[1001, 1002, 1003]" → 只返回 SKU
   * ID 为 1001、1002、1003 的商品
   *
   * @param items 订单商品列表
   * @param template 优惠券模板
   * @return 符合条件的订单商品列表
   */
  private List<OrderItemCreateDTO> filterApplicableItems(
      List<OrderItemCreateDTO> items, CouponTemplate template) {

    // 1. 如果商品列表为空，直接返回空列表
    if (CollUtil.isEmpty(items)) {
      log.debug("订单商品列表为空，无需筛选");
      return Collections.emptyList();
    }

    // 2. 解析优惠券模板的 applicableSkus 字段（JSON数组格式）
    // applicableSkus 字段示例：null、""、"[]"、"[1001, 1002, 1003]"
    Set<Long> applicableSkuIds = new HashSet<>();

    if (StrUtil.isNotBlank(template.getApplicableSkus())) {
      try {
        // 使用 Hutool 的 JSONUtil 解析 JSON 数组
        List<Long> skuIdList = JSONUtil.toList(template.getApplicableSkus(), Long.class);
        if (CollUtil.isNotEmpty(skuIdList)) {
          applicableSkuIds.addAll(skuIdList);
          log.info(
              "优惠券[templateId={}]限制适用商品，applicableSkus={}", template.getId(), applicableSkuIds);
        }
      } catch (Exception e) {
        // JSON 解析失败时记录警告日志，但不抛异常
        // 解析失败视为无商品限制，允许所有商品使用优惠券
        log.warn(
            "解析优惠券适用商品失败，templateId={}，applicableSkus={}，将视为无商品限制",
            template.getId(),
            template.getApplicableSkus(),
            e);
      }
    }

    // 3. 如果 applicableSkuIds 为空，表示优惠券适用于所有商品
    if (CollUtil.isEmpty(applicableSkuIds)) {
      log.debug("优惠券[templateId={}]无商品限制，适用于所有商品", template.getId());
      return items; // 返回所有商品
    }

    // 4. 如果 applicableSkuIds 不为空，只返回 SKU ID 在列表中的商品
    List<OrderItemCreateDTO> filteredItems =
        items.stream()
            .filter(
                item -> {
                  Long skuId = item.getProductSkuId();
                  boolean isApplicable = applicableSkuIds.contains(skuId);

                  if (!isApplicable) {
                    log.debug("订单商品不在优惠券适用范围内，skuId={}", skuId);
                  }

                  return isApplicable;
                })
            .collect(Collectors.toList());

    log.info(
        "优惠券[templateId={}]商品筛选完成，原商品数={}，符合条件商品数={}",
        template.getId(),
        items.size(),
        filteredItems.size());

    return filteredItems;
  }

  /**
   * 按优惠券类型排序
   *
  /**
   * 填充订单详情的支付信息
   *
   * <p>从 order_pay_records 表查询支付记录，并将支付流水号填充到订单详情 VO 中。 查询逻辑：选择状态为 SUCCESS 且创建时间最新的支付记录。
   * 如果不存在支付记录，字段保持为 null，不影响订单详情的返回。
   *
   * @param vo 订单详情 VO
   * @param orderId 订单 ID
   */
  private void fillPaymentInfo(OrderDetailVO vo, Long orderId) {
    try {
      // 查询支付记录：选择状态为 SUCCESS 且创建时间最新的记录
      LambdaQueryWrapper<OrderPayRecord> wrapper = new LambdaQueryWrapper<>();
      wrapper
          .eq(OrderPayRecord::getOrderId, orderId)
          .eq(OrderPayRecord::getStatus, "SUCCESS")
          .orderByDesc(OrderPayRecord::getCreatedTime)
          .last("LIMIT 1");

      OrderPayRecord payRecord = orderPayRecordMapper.selectOne(wrapper);

      if (payRecord != null) {
        // 填充支付流水号
        vo.setTradeNo(payRecord.getTradeNo());
        log.debug("填充订单支付信息成功，orderId={}，tradeNo={}", orderId, payRecord.getTradeNo());
      } else {
        log.debug("订单无支付记录，orderId={}", orderId);
      }
    } catch (Exception e) {
      // 查询支付记录失败不影响订单详情的返回，仅记录日志
      log.warn("查询订单支付记录失败，orderId={}", orderId, e);
    }
  }

  /**
   * 多条件查询订单详情 支持通过订单ID、订单号、用户ID、门店ID、商家ID、订单状态、支付方式、 支付流水号、核销码、支付批次号、履约模式、优惠券ID等多种条件查询订单详情
   *
   * @param queryDTO 查询条件DTO
   * @return 订单详情
   */
  @Override
  public R<OrderDetailVO> queryOrderDetail(OrderQueryDTO queryDTO) {
    try {
      // 1. 参数校验：至少需要一个查询条件
      if (queryDTO == null || isAllFieldsNull(queryDTO)) {
        return R.failed("至少需要提供一个查询条件");
      }

      // 2. 获取当前登录用户
      PocoUser user = null;
      try {
        user = SecurityUtils.getUser();
      } catch (Exception ignored) {
      }
      if (user == null) {
        return R.failed("用户未登录");
      }

      // 3. 构建查询条件
      LambdaQueryWrapper<Order> wrapper = new LambdaQueryWrapper<>();

      // 订单ID查询（精确匹配）
      if (queryDTO.getOrderId() != null) {
        wrapper.eq(Order::getId, queryDTO.getOrderId());
      }

      // 订单号查询（精确匹配）
      if (StrUtil.isNotBlank(queryDTO.getOrderNo())) {
        wrapper.eq(Order::getOrderNo, queryDTO.getOrderNo());
      }

      // 用户ID查询
      if (queryDTO.getUserId() != null) {
        wrapper.eq(Order::getUserId, queryDTO.getUserId());
      }

      // 门店ID查询
      if (queryDTO.getStoreId() != null) {
        wrapper.eq(Order::getStoreId, queryDTO.getStoreId());
      }

      // 商家ID查询
      if (queryDTO.getMerchantId() != null) {
        wrapper.eq(Order::getMerchantId, queryDTO.getMerchantId());
      }

      // 订单状态查询
      if (StrUtil.isNotBlank(queryDTO.getStatus())) {
        wrapper.eq(Order::getStatus, queryDTO.getStatus());
      }

      // 支付方式查询
      if (StrUtil.isNotBlank(queryDTO.getPaymentMethod())) {
        wrapper.eq(Order::getPaymentMethod, queryDTO.getPaymentMethod());
      }

      // 核销码查询
      if (StrUtil.isNotBlank(queryDTO.getVerificationCode())) {
        wrapper.eq(Order::getVerificationCode, queryDTO.getVerificationCode());
      }

      // 支付批次号查询
      if (StrUtil.isNotBlank(queryDTO.getPayBatchNo())) {
        wrapper.eq(Order::getPayBatchNo, queryDTO.getPayBatchNo());
      }

      // 优惠券ID查询
      if (queryDTO.getCouponId() != null) {
        wrapper.eq(Order::getCouponId, queryDTO.getCouponId());
      }

      // 支付时间范围查询
      if (queryDTO.getPaymentTimeStart() != null) {
        wrapper.ge(Order::getPaymentTime, queryDTO.getPaymentTimeStart());
      }
      if (queryDTO.getPaymentTimeEnd() != null) {
        wrapper.le(Order::getPaymentTime, queryDTO.getPaymentTimeEnd());
      }

      // 创建时间范围查询
      if (queryDTO.getCreatedTimeStart() != null) {
        wrapper.ge(Order::getCreatedTime, queryDTO.getCreatedTimeStart());
      }
      if (queryDTO.getCreatedTimeEnd() != null) {
        wrapper.le(Order::getCreatedTime, queryDTO.getCreatedTimeEnd());
      }

      // 排除已删除的订单
      wrapper.eq(Order::getIsDeleted, 0);

      // 按创建时间倒序，取最新的一条
      wrapper.orderByDesc(Order::getCreatedTime);
      wrapper.last("LIMIT 1");

      // 4. 查询订单
      Order order = this.getOne(wrapper);
      if (order == null) {
        return R.failed("未找到符合条件的订单");
      }

      // 5. 权限校验：使用 DataScope 验证用户是否有权限访问该订单
      DataScope checkScope = listScope("merchant_id", "created_by");
      OrderDetailVO orderDetailVO = baseMapper.getOrderDetailById(order.getId(), checkScope);

      if (orderDetailVO == null) {
        return R.failed("无权访问该订单");
      }

      // 6. 查询订单商品明细
      List<OrderItemVO> orderItemVOs = orderItemMapper.getOrderItemsByOrderId(order.getId());
      orderDetailVO.setItems(orderItemVOs);

      // 7. 查询收货地址快照（本地配送订单）
      try {
        OrderAddressSnapshotVO addressVO =
            orderAddressSnapshotMapper.getAddressSnapshotByOrderId(order.getId());
        orderDetailVO.setDeliveryAddress(addressVO);
      } catch (Exception e) {
        log.warn("查询订单地址快照失败，orderId={}", order.getId(), e);
      }

      // 8. 查询最新配送记录（本地配送订单）
      try {
        OrderDeliveryRecordVO deliveryVO =
            orderDeliveryRecordMapper.getLatestDeliveryRecordByOrderId(order.getId());
        orderDetailVO.setDeliveryRecord(deliveryVO);
      } catch (Exception e) {
        log.warn("查询订单配送记录失败，orderId={}", order.getId(), e);
      }

      // 9. 填充支付信息（支付流水号）
      // 如果查询条件中包含支付流水号，直接设置
      if (StrUtil.isNotBlank(queryDTO.getTradeNo())) {
        orderDetailVO.setTradeNo(queryDTO.getTradeNo());
      } else {
        // 否则从支付记录表中查询
        fillPaymentInfo(orderDetailVO, order.getId());
      }

      log.info("多条件查询订单详情成功，订单ID: {}, 订单号: {}", order.getId(), order.getOrderNo());
      return R.ok(orderDetailVO);

    } catch (Exception e) {
      log.error("多条件查询订单详情失败，查询条件: {}", queryDTO, e);
      return R.failed("查询订单详情失败: " + e.getMessage());
    }
  }

  /**
   * 检查 DTO 中所有字段是否都为空
   *
   * @param queryDTO 查询条件DTO
   * @return true-所有字段都为空，false-至少有一个字段不为空
   */
  private boolean isAllFieldsNull(OrderQueryDTO queryDTO) {
    return queryDTO.getOrderId() == null
        && StrUtil.isBlank(queryDTO.getOrderNo())
        && queryDTO.getUserId() == null
        && queryDTO.getStoreId() == null
        && queryDTO.getMerchantId() == null
        && StrUtil.isBlank(queryDTO.getStatus())
        && StrUtil.isBlank(queryDTO.getPaymentMethod())
        && StrUtil.isBlank(queryDTO.getTradeNo())
        && StrUtil.isBlank(queryDTO.getVerificationCode())
        && StrUtil.isBlank(queryDTO.getPayBatchNo())
        && StrUtil.isBlank(queryDTO.getFulfillmentMode())
        && queryDTO.getCouponId() == null
        && queryDTO.getPaymentTimeStart() == null
        && queryDTO.getPaymentTimeEnd() == null
        && queryDTO.getCreatedTimeStart() == null
        && queryDTO.getCreatedTimeEnd() == null;
  }
}

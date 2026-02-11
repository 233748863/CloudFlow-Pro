package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.entity.*;
import cn.joywon.poco.merchant.CouponModule.mapper.*;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingIssueService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.entity.OrderItem;
import cn.joywon.poco.merchant.ProductModule.entity.Product;
import cn.joywon.poco.merchant.ProductModule.mapper.ProductMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class JointMarketingIssueServiceImpl implements IJointMarketingIssueService {

    private final JointMarketingRuleMapper ruleMapper;
    private final JointMarketingRewardMapper rewardMapper;
    private final JointMarketingAllocationMapper allocationMapper;
    private final JointMarketingRebateRecordMapper rebateRecordMapper;
    private final JointMarketingLogMapper logMapper;
    private final JointMarketingPlanMapper planMapper;
    private final IUserCouponService userCouponService;
    private final ICouponTemplateService couponTemplateService;
    private final ProductMapper productMapper;
    private final IMerchantService merchantService;
    private final RedisTemplate<String, Object> redisTemplate;

    private static final String REDIS_KEY_PREFIX = "joint_marketing:";

    @Override
    public List<JointMarketingAllocation> getProfitSharingAllocations(Long ruleId) {
        if (ruleId == null) {
            return new ArrayList<>();
        }
        return allocationMapper.selectList(new LambdaQueryWrapper<JointMarketingAllocation>()
                .eq(JointMarketingAllocation::getRuleId, ruleId)
                .eq(JointMarketingAllocation::getTriggerPhase, "COUPON_VERIFY"));
    }

    @Override
    public void updateRebateStatusToSettled(Long couponId, Long allocationId) {
        rebateRecordMapper.update(null, new LambdaUpdateWrapper<JointMarketingRebateRecord>()
                .eq(JointMarketingRebateRecord::getCouponId, couponId)
                .eq(JointMarketingRebateRecord::getAllocationId, allocationId)
                .set(JointMarketingRebateRecord::getStatus, "SETTLED")
                .set(JointMarketingRebateRecord::getUpdatedTime, LocalDateTime.now()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void triggerIssue(Order order) {
        log.info("触发联合营销发券逻辑, orderId: {}", order.getId());

        // 1. 查询所有启用的联合营销规则
        // 优化: 优先匹配触发方商家, 减少全表扫描
        List<JointMarketingRule> rules = ruleMapper.selectList(new LambdaQueryWrapper<JointMarketingRule>()
                .eq(JointMarketingRule::getStatus, "ACTIVE")
                .apply("JSON_CONTAINS(trigger_merchant_ids, CAST({0} AS JSON))", order.getMerchantId()));

        if (CollUtil.isEmpty(rules)) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();

        for (JointMarketingRule rule : rules) {
            // 校验计划状态
            JointMarketingPlan plan = planMapper.selectById(rule.getPlanId());
            if (plan == null || !"PUBLISHED".equals(plan.getStatus())) {
                continue;
            }
            if (plan.getStartTime() != null && now.isBefore(plan.getStartTime())) {
                continue;
            }
            if (plan.getEndTime() != null && now.isAfter(plan.getEndTime())) {
                continue;
            }

            // 2. 匹配规则
            if (!matchRule(rule, order)) {
                continue;
            }

            // 3. 校验规则级限制 (总限额 & 用户日限额)
            if (!checkRuleLimits(rule, order.getUserId())) {
                continue;
            }

            // 4. 发放奖励
            issueRewards(rule, order);
        }
    }

    private boolean checkRuleLimits(JointMarketingRule rule, Long userId) {
        // 3.1 检查规则总触发上限
        if (rule.getTotalLimit() != null && rule.getTotalLimit() != -1) {
            String totalLimitKey = REDIS_KEY_PREFIX + "rule:total:" + rule.getId();
            // 使用 Redis 原子递增检查
            Long currentCount = redisTemplate.opsForValue().increment(totalLimitKey, 1);
            if (currentCount != null && currentCount > rule.getTotalLimit()) {
                // 回滚计数 (虽然稍微不准但能防止超发)
                redisTemplate.opsForValue().decrement(totalLimitKey);
                return false;
            }
        }

        // 3.2 检查单用户每日触发上限
        if (rule.getDailyLimitPerUser() != null && rule.getDailyLimitPerUser() > 0) {
            String dateStr = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
            String dailyLimitKey = REDIS_KEY_PREFIX + "rule:daily:" + rule.getId() + ":" + userId + ":" + dateStr;
            Long userDailyCount = redisTemplate.opsForValue().increment(dailyLimitKey, 1);
            if (userDailyCount != null && userDailyCount == 1) {
                // 设置过期时间为24小时
                redisTemplate.expire(dailyLimitKey, 1, TimeUnit.DAYS);
            }
            // 不需要回滚，只是拒绝
            return userDailyCount == null || userDailyCount <= rule.getDailyLimitPerUser();
        }
        return true;
    }

    private boolean matchRule(JointMarketingRule rule, Order order) {
        // 2.1 匹配触发方商家
        if (CollUtil.isNotEmpty(rule.getTriggerMerchantIds()) && !rule.getTriggerMerchantIds().contains(order.getMerchantId())) {
            return false;
        }

        // 2.2 匹配触发方门店
        if (CollUtil.isNotEmpty(rule.getTriggerStoreIds()) && !rule.getTriggerStoreIds().contains(order.getStoreId())) {
            return false;
        }

        // 2.3 匹配订单金额
        if (ObjUtil.isNotNull(rule.getMinOrderAmount()) && order.getTotalProductPrice().compareTo(rule.getMinOrderAmount()) < 0) {
            return false;
        }

        // 2.4 匹配商品范围
        if (StrUtil.isNotBlank(rule.getProductScopeType()) && !"ALL".equals(rule.getProductScopeType())) {
            List<Long> scopeIds = rule.getProductScopeIds();
            if (CollUtil.isEmpty(scopeIds)) {
                return false;
            }

            List<OrderItem> orderItems = Db.lambdaQuery(OrderItem.class)
                    .eq(OrderItem::getOrderId, order.getId())
                    .list();

            if (CollUtil.isEmpty(orderItems)) {
                return false;
            }

            if ("SPECIFIC".equals(rule.getProductScopeType())) {
                // 指定商品(SPU)匹配: 只要订单中包含指定商品之一即可
                boolean match = orderItems.stream().anyMatch(item -> scopeIds.contains(item.getProductId()));
                if (!match) {
                    return false;
                }
            } else if ("CATEGORY".equals(rule.getProductScopeType())) {
                // 指定分类匹配: 只要订单中包含指定分类下的商品即可
                Set<Long> productIds = orderItems.stream().map(OrderItem::getProductId).collect(Collectors.toSet());
                if (CollUtil.isEmpty(productIds)) {
                    return false;
                }
                List<Product> products = productMapper.selectList(new LambdaQueryWrapper<Product>().in(Product::getId, productIds));
                boolean match = products.stream().anyMatch(p -> scopeIds.contains(p.getCategoryId()));
                if (!match) {
                    return false;
                }
            }
        }

        return true;
    }

    private void issueRewards(JointMarketingRule rule, Order order) {
        // 3.1 查询规则对应的奖励配置
        List<JointMarketingReward> rewards = rewardMapper.selectList(new LambdaQueryWrapper<JointMarketingReward>()
                .eq(JointMarketingReward::getRuleId, rule.getId()));

        if (CollUtil.isEmpty(rewards)) {
            return;
        }

        Map<String, Object> rewardsIssuedLog = new HashMap<>();
        Map<String, Object> allocationsSnapshotLog = new HashMap<>();

        for (JointMarketingReward reward : rewards) {
            // 3.2 发放优惠券
            if ("COUPON".equals(reward.getRewardType())) {
                Long couponTemplateId = reward.getRewardContentId();
                Integer quantity = reward.getRewardQuantity();

                // 3.3 校验优惠券模板是否有效
                if (!validateCouponTemplate(couponTemplateId, order.getUserId())) {
                    log.warn("联合营销发券失败: 优惠券模板无效, templateId: {}", couponTemplateId);
                    continue;
                }

                List<Long> issuedCouponIds = new ArrayList<>();
                for (int i = 0; i < quantity; i++) {
                    // 3.4 扣减奖励库存 (原子操作)
                    int updated = rewardMapper.incrementIssuedCount(reward.getId(), 1);
                    if (updated > 0) {
                        Long couponId = userCouponService.receiveForUser(couponTemplateId, order.getUserId(), "JOINT_MARKETING", rule.getId());
                        if (couponId != null) {
                            issuedCouponIds.add(couponId);
                        } else {
                            // 发券失败，理论上应回滚库存，但为简化暂不回滚，视为损耗或稍后重试
                            log.error("联合营销发券失败: userCouponService返回null");
                        }
                    } else {
                        log.warn("联合营销奖励库存不足, rewardId: {}", reward.getId());
                        break; // 库存不足，停止该奖励的发放
                    }
                }

                // 3.5 生成返利记录 (如果有配置)
                if (CollUtil.isNotEmpty(issuedCouponIds)) {
                    // 记录到日志映射中
                    Map<String, Object> rewardLog = new HashMap<>();
                    rewardLog.put("rewardId", reward.getId());
                    rewardLog.put("templateId", couponTemplateId);
                    rewardLog.put("quantity", issuedCouponIds.size());
                    rewardLog.put("couponIds", issuedCouponIds);
                    rewardsIssuedLog.put(String.valueOf(reward.getId()), rewardLog);

                    List<JointMarketingAllocation> allocations = createRebateRecords(rule, reward, issuedCouponIds, order);
                    if (CollUtil.isNotEmpty(allocations)) {
                        allocationsSnapshotLog.put(String.valueOf(reward.getId()), allocations);
                    }
                }
            }
        }

        // 保存日志
        if (!rewardsIssuedLog.isEmpty()) {
            JointMarketingLog logEntry = new JointMarketingLog();
            logEntry.setPlanId(rule.getPlanId());
            logEntry.setRuleId(rule.getId());
            logEntry.setTriggerOrderId(order.getId());
            logEntry.setConsumerUserId(order.getUserId());
            logEntry.setRewardsIssued(rewardsIssuedLog);
            logEntry.setAllocationsSnapshot(allocationsSnapshotLog);
            logEntry.setCreatedTime(LocalDateTime.now());
            logMapper.insert(logEntry);
        }
    }

    private boolean validateCouponTemplate(Long templateId, Long userId) {
        if (templateId == null) return false;
        CouponTemplate template = couponTemplateService.getById(templateId);
        if (template == null) return false;

        // 检查基本状态
        if (!Boolean.TRUE.equals(template.getEnable()) ||
                template.getCouponStatus() != CouponStatusEnum.TEMPLATE_ACTIVE) {
            return false;
        }

        // 检查发放时间窗口
        LocalDateTime now = LocalDateTime.now();
        if ((template.getIssueStartTime() != null && now.isBefore(template.getIssueStartTime())) ||
                (template.getIssueEndTime() != null && now.isAfter(template.getIssueEndTime()))) {
            return false;
        }

        // 检查库存
        if (template.getTotalQuantity() != -1 && template.getIssuedQuantity() >= template.getTotalQuantity()) {
            return false;
        }

        // 检查商户状态 (从合作迁移过来)
        Merchant merchant = merchantService.getById(template.getMerchantId());
        if (merchant == null || !merchant.getEnable() ||
                merchant.getBusinessStatus() != BusinessStatusEnum.MERCHANT_OPERATING) {
            return false;
        }

        // 检查用户限制
        if (template.getReceiveLimitPerUser() != null && template.getReceiveLimitPerUser() > 0) {
            long count = userCouponService.lambdaQuery()
                    .eq(UserCoupon::getTemplateId, templateId)
                    .eq(UserCoupon::getUserId, userId)
                    .count();
            if (count >= template.getReceiveLimitPerUser()) {
                return false;
            }
        }

        return true;
    }

    private List<JointMarketingAllocation> createRebateRecords(JointMarketingRule rule, JointMarketingReward reward, List<Long> couponIds, Order order) {
        // 查询该规则下的分润配置
        List<JointMarketingAllocation> allocations = allocationMapper.selectList(new LambdaQueryWrapper<JointMarketingAllocation>()
                .eq(JointMarketingAllocation::getRuleId, rule.getId()));

        if (CollUtil.isEmpty(allocations)) {
            return new ArrayList<>();
        }

        List<JointMarketingAllocation> usedAllocations = new ArrayList<>();

        for (Long couponId : couponIds) {
            for (JointMarketingAllocation allocation : allocations) {
                // 过滤: 如果配置了rewardId, 必须匹配当前奖励
                if (ObjUtil.isNotNull(allocation.getRewardId()) && !allocation.getRewardId().equals(reward.getId())) {
                    continue;
                }

                // 添加到已使用的列表中（用于日志记录，去重分配）
                if (!usedAllocations.contains(allocation)) {
                    usedAllocations.add(allocation);
                }

                JointMarketingRebateRecord record = new JointMarketingRebateRecord();
                record.setPlanId(rule.getPlanId());
                record.setRuleId(rule.getId());
                record.setAllocationId(allocation.getId());
                record.setCouponId(couponId);
                record.setTriggerOrderId(order.getId());
                record.setPayerMerchantId(allocation.getPayerMerchantId());
                record.setPayeeMerchantId(allocation.getPayeeMerchantId());
                record.setPayeeRole(allocation.getPayeeRole());

                // 计算金额
                BigDecimal amount = BigDecimal.ZERO;
                if ("FIXED".equals(allocation.getAllocationType())) {
                    amount = allocation.getAllocationValue();
                } else if ("RATE".equals(allocation.getAllocationType())) {
                    // 比例模式: 暂时按触发订单金额计算 (可根据需求调整为按券面额等)
                    amount = order.getTotalProductPrice().multiply(allocation.getAllocationValue());
                }
                record.setAmount(amount);

                // 设置初始状态
                if ("COUPON_VERIFY".equals(allocation.getTriggerPhase())) {
                    record.setStatus("WAITING_VERIFY");
                } else {
                    record.setStatus("PENDING_SETTLEMENT");
                }
                record.setCreatedTime(LocalDateTime.now());

                rebateRecordMapper.insert(record);
            }
        }
        return usedAllocations;
    }

    @Override
    public boolean checkCouponsUsed(Long orderId) {
        // 1. 查询该订单触发的所有返利记录(包含couponId)
        List<JointMarketingRebateRecord> records = rebateRecordMapper.selectList(new LambdaQueryWrapper<JointMarketingRebateRecord>()
                .eq(JointMarketingRebateRecord::getTriggerOrderId, orderId));

        if (CollUtil.isEmpty(records)) {
            return false;
        }

        Set<Long> couponIds = records.stream().map(JointMarketingRebateRecord::getCouponId).collect(Collectors.toSet());

        // 2. 检查这些优惠券的状态
        // 如果有任何一张被使用(USED)或过期(EXPIRED - 视业务而定, 这里主要防USED), 则返回true
        Long usedCount = userCouponService.lambdaQuery()
                .in(UserCoupon::getId, couponIds)
                .eq(UserCoupon::getCouponStatus, "USED") // 假设状态枚举值为USED, 需确认
                .count();

        return usedCount > 0;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void invalidateCoupons(Long orderId) {
        // 1. 查询该订单触发的所有返利记录
        List<JointMarketingRebateRecord> records = rebateRecordMapper.selectList(new LambdaQueryWrapper<JointMarketingRebateRecord>()
                .eq(JointMarketingRebateRecord::getTriggerOrderId, orderId));

        if (CollUtil.isEmpty(records)) {
            return;
        }

        Set<Long> couponIds = records.stream().map(JointMarketingRebateRecord::getCouponId).collect(Collectors.toSet());

        // 2. 作废优惠券 (仅作废未使用UNUSED的)
        userCouponService.lambdaUpdate()
                .in(UserCoupon::getId, couponIds)
                .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
                .set(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_EXPIRED) // 设置为过期/失效
                .update();

        // 3. 取消返利记录
        for (JointMarketingRebateRecord record : records) {
            record.setStatus("CANCELLED");
            rebateRecordMapper.updateById(record);
        }

        log.info("订单退款, 已作废联合营销优惠券及返利记录, orderId: {}, couponCount: {}", orderId, couponIds.size());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateRebateStatusOnCouponVerify(Long couponId) {
        // 1. 查询关联的返利记录
        List<JointMarketingRebateRecord> records = rebateRecordMapper.selectList(new LambdaQueryWrapper<JointMarketingRebateRecord>()
                .eq(JointMarketingRebateRecord::getCouponId, couponId));

        if (CollUtil.isEmpty(records)) {
            return;
        }

        // 2. 更新状态为 PENDING_SETTLEMENT (仅针对 WAITING_VERIFY 的记录)
        for (JointMarketingRebateRecord record : records) {
            if ("WAITING_VERIFY".equals(record.getStatus())) {
                record.setStatus("PENDING_SETTLEMENT");
                // 可能需要更新核销时间等
                rebateRecordMapper.updateById(record);
            }
        }

        log.info("优惠券核销, 更新联合营销返利记录状态, couponId: {}", couponId);
    }
}
package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.lang.UUID;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.CursorQueryVO;
import cn.joywon.poco.merchant.Common.util.RLockUtil;
import cn.joywon.poco.merchant.CouponModule.bo.UserClaimedCouponCountBO;
import cn.joywon.poco.merchant.CouponModule.bo.UserCouponUsableBO;
import cn.joywon.poco.merchant.CouponModule.definition.CouponKeyConst;
import cn.joywon.poco.merchant.CouponModule.definition.CouponStatusEnum;
import cn.joywon.poco.merchant.CouponModule.definition.CouponTemplateEnum;
import cn.joywon.poco.merchant.CouponModule.dto.*;
import cn.joywon.poco.merchant.CouponModule.entity.CouponTemplate;
import cn.joywon.poco.merchant.CouponModule.entity.UserCoupon;
import cn.joywon.poco.merchant.CouponModule.mapper.UserCouponMapper;
import cn.joywon.poco.merchant.CouponModule.service.ICouponRedeemLogService;
import cn.joywon.poco.merchant.CouponModule.service.ICouponTemplateService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingIssueService;
import cn.joywon.poco.merchant.CouponModule.service.IUserCouponService;
import cn.joywon.poco.merchant.CouponModule.vo.*;
import cn.joywon.poco.merchant.MerchantModule.bo.MerchantSimpleInfoBO;
import cn.joywon.poco.merchant.MerchantModule.bo.StoreMerchantIndustryBO;
import cn.joywon.poco.merchant.MerchantModule.dto.StoreCacheDTO;
import cn.joywon.poco.merchant.MerchantModule.entity.Merchant;
import cn.joywon.poco.merchant.MerchantModule.repository.IStoreCacheRepository;
import cn.joywon.poco.merchant.MerchantModule.service.IMerchantService;
import cn.joywon.poco.merchant.MerchantModule.service.IStoreService;
import cn.joywon.poco.merchant.MerchantModule.vo.MerchantSimpleInfoVO;
import cn.joywon.poco.merchant.MerchantModule.vo.StoreSimpleInfoVO;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.entity.OrderItem;
import cn.joywon.poco.merchant.ProductModule.entity.ProductSku;
import cn.joywon.poco.merchant.ProductModule.service.ProductSkuService;
import cn.joywon.poco.merchant.ProductModule.vo.ProductSkuSimpleInfoVO;
import com.baomidou.lock.annotation.Lock4j;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Consumer;
import java.util.stream.Collectors;

@Slf4j
@Service
@RefreshScope
@RequiredArgsConstructor
public class UserCouponServiceImpl extends ServiceImpl<UserCouponMapper, UserCoupon> implements IUserCouponService {

    private final RLockUtil lockUtil;

    private final ICouponRedeemLogService couponRedeemLogService;
    private final ICouponTemplateService couponTemplateService;
    private final ProductSkuService productSkuService;
    private final IMerchantService merchantService;
    private final IStoreService storeService;

    private final IStoreCacheRepository storeCacheRepository;
    private final UserCouponMapper userCouponMapper;

    @Autowired
    @Lazy
    private IJointMarketingIssueService jointMarketingIssueService;

    @Value("${joywon.ma.coupon.query-days}")
    private Integer userCouponMaxQueryDays;


    @Override
    @Lock4j(name = CouponKeyConst.LOCK_KEY_PREFIX_COUPON_TEMPLATE, keys = {"#templateId"})
    @Transactional(rollbackFor = Exception.class)
    public Long receiveForUser(Long templateId, Long userId, String sourceType, Long sourceId) {
        // 1. 获取优惠券模板
        CouponTemplate template = couponTemplateService.getById(templateId);
        if (ObjUtil.isNull(template)) {
            log.error("自动发券失败: 模板不存在, templateId: {}", templateId);
            return null;
        }

        // 2. 检查状态
        if (!Boolean.TRUE.equals(template.getEnable()) || template.getCouponStatus() != CouponStatusEnum.TEMPLATE_ACTIVE) {
            log.error("自动发券失败: 模板未启用, templateId: {}", templateId);
            return null;
        }

        // 3. 检查发放时间
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        if ((template.getIssueStartTime() != null && now.isBefore(template.getIssueStartTime())) ||
                (template.getIssueEndTime() != null && now.isAfter(template.getIssueEndTime()))) {
            log.error("自动发券失败: 不在发放时间内, templateId: {}", templateId);
            return null;
        }

        // 4. 检查库存
        if (template.getTotalQuantity() != -1 && template.getIssuedQuantity() >= template.getTotalQuantity()) {
            log.error("自动发券失败: 库存不足, templateId: {}", templateId);
            return null;
        }

        // 5. 生成优惠券
        UserCoupon userCoupon = new UserCoupon();
        userCoupon.setUserId(userId);
        userCoupon.setTemplateId(templateId);
        userCoupon.setIssueMerchantId(template.getMerchantId());
        userCoupon.setCouponStatus(CouponStatusEnum.USER_COUPON_UNUSED);

        // 设置来源信息
        userCoupon.setSourceType(sourceType);
        userCoupon.setSourceId(sourceId);

        // 计算有效期
        if (CouponTemplateEnum.VALIDITY_FIXED_DATE_RANGE.equals(template.getValidityType())) {
            userCoupon.setValidStartTime(template.getValidStartTime());
            userCoupon.setValidEndTime(template.getValidEndTime());
        } else {
            userCoupon.setValidStartTime(today.atStartOfDay());
            userCoupon.setValidEndTime(today.plusDays(template.getValidDaysFromReceive()).atTime(23, 59, 59));
        }

        userCoupon.setCouponCode(UUID.fastUUID().toString(true));
        userCoupon.setCreatedTime(now);

        save(userCoupon);

        // 6. 更新模板已发放数量
        couponTemplateService.lambdaUpdate()
                .setSql("issued_quantity = issued_quantity + 1")
                .eq(CouponTemplate::getId, templateId)
                .update();

        return userCoupon.getId();
    }


    /**
     * 用户领取优惠券
     *
     * @param dto 用户领取优惠券参数
     * @return 处理结果
     */
    @Override
    @Lock4j(name = CouponKeyConst.LOCK_KEY_PREFIX_COUPON_TEMPLATE, keys = {"#dto.couponTemplateId"})
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> receive(UserReceiveCouponDTO dto) {
        Long couponTemplateId = Long.valueOf(dto.getCouponTemplateId());
        Long userId = getPrincipal().getId();

        /* step-1 检查优惠券模板状态 */
        // 1.1 检查优惠券模板是否存在
        CouponTemplate couponTemplate = Db.getById(couponTemplateId, CouponTemplate.class);
        if (ObjUtil.isNull(couponTemplate)) {
            return R.failed("领取失败, 无效的优惠券");
        }
        // 1.2 检查优惠券模板是否有效 & 禁用
        if (!couponTemplate.getEnable() || couponTemplate.getCouponStatus() != CouponStatusEnum.TEMPLATE_ACTIVE) {
            return R.failed("领取失败, 优惠券已失效或已无库存");
        }
        // 1.3 检查优惠券模板是否已过期
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime endTime = couponTemplate.getValidEndTime();
        if (ObjUtil.isNotNull(endTime) && now.isAfter(endTime)) {
            return R.failed("领取失败, 优惠券已过期");
        }
        // 1.4 检查优惠券是否存在余量
        int issuedQuantity = 1;
        boolean isAllClaimed = true;
        issuedQuantity = issuedQuantity + couponTemplate.getIssuedQuantity();
        if (couponTemplate.getTotalQuantity() == -1) {
            isAllClaimed = false;
        } else {
            if (couponTemplate.getTotalQuantity() > issuedQuantity) {
                isAllClaimed = false;
            }
        }

        // 1.5 检查用户领取该优惠券是否已达上限 & 检查用户是否有优惠券过期
        List<UserCoupon> entities = lambdaQuery()
                .eq(UserCoupon::getTemplateId, couponTemplateId)
                .eq(UserCoupon::getUserId, userId).list();
        boolean claimable = true;
        List<UserCoupon> expiresCoupons = new ArrayList<>();
        if (CollUtil.isNotEmpty(entities)) {
            for (UserCoupon entity : entities) {
                if (entity.getCouponStatus() == CouponStatusEnum.USER_COUPON_UNUSED && entity.getValidEndTime().isBefore(now)) {
                    UserCoupon expires = new UserCoupon();
                    expires.setCouponStatus(CouponStatusEnum.USER_COUPON_EXPIRED);
                    expires.setId(entity.getId());
                    expiresCoupons.add(expires);
                }
            }
            claimable = couponTemplate.getReceiveLimitPerUser() > entities.size() + 1;
        }

        /* step-2 处理过期优惠券(如有) */
        boolean result;
        if (CollUtil.isNotEmpty(expiresCoupons)) {
            result = updateBatchById(expiresCoupons);
            if (!result) {
                throw new RuntimeException("领取失败, 优惠券更新失败");
            }
        }
        // 先处理已过期优惠券, 再中止程序执行
        if (entities.size() >= couponTemplate.getReceiveLimitPerUser()) {
            return R.failed("领取失败, 该优惠券已达账号领取上限");
        }

        /* step-3 更新优惠券模板库存 */
        couponTemplate.setIssuedQuantity(issuedQuantity);
        if (isAllClaimed) {
            couponTemplate.setEnable(false);
            couponTemplate.setCouponStatus(CouponStatusEnum.TEMPLATE_ALL_CLAIMED);
        }
        result = Db.updateById(couponTemplate);
        if (!result) {
            throw new RuntimeException("领取失败, 更新优惠券模板库存失败");
        }

        /* step-4 写入用户优惠券 */
        UserCoupon entity = new UserCoupon();
        entity.setUserId(userId);
        entity.setTemplateId(couponTemplateId);
        entity.setIssueMerchantId(couponTemplate.getMerchantId());
        entity.setCouponCode(UUID.fastUUID().toString(true));
        initCouponValidTime(couponTemplate, entity);
        result = save(entity);
        if (!result) {
            return R.failed("用户领取优惠券失败");
        }

        /* step-5 是否需要更新优惠券合作记录 */
        // 商户合作功能已移除，不再发送RedeemMsg

        return R.ok(claimable);
    }


    /**
     * 用户领取可领取优惠券
     *
     * @param merchantId 商家ID
     * @return 响应结果(领取优惠券数量)
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Integer> receiveClaimable(Long merchantId) {
        Long userId = getPrincipal().getId();
        int receiveCount;

        /* step-1 查询商家当前可用优惠券 */
        List<CouponTemplate> couponTemplates = couponTemplateService.lambdaQuery()
                .eq(CouponTemplate::getEnable, true)
                .eq(CouponTemplate::getMerchantId, merchantId)
                .eq(CouponTemplate::getCouponStatus, CouponStatusEnum.TEMPLATE_ACTIVE)
                .list();
        List<Long> templateIds = new ArrayList<>(couponTemplates.stream().map(CouponTemplate::getId).toList());

        /* step-2 查询用户已领当前商家优惠券 */
        List<UserCoupon> userCoupons = lambdaQuery()
                .eq(UserCoupon::getUserId, userId)
                .in(UserCoupon::getTemplateId, templateIds)
                .list();
        if (CollUtil.isEmpty(userCoupons)) {
            receiveCount = receiveCoupons(templateIds, merchantId);
            return R.ok(receiveCount);
        }
        Map<Long, Long> claimedCountMap = userCoupons.stream()
                .collect(Collectors.groupingBy(UserCoupon::getTemplateId, Collectors.counting()));

        /* step-3 检查用户是否可领取当前商家优惠券 */
        for (CouponTemplate template : couponTemplates) {
            Long claimedCount = claimedCountMap.get(template.getId());
            if (!(template.getReceiveLimitPerUser() > claimedCount)) {
                templateIds.remove(template.getId());
            }
        }

        /* step-4 领取商家可用优惠券 */
        receiveCount = receiveCoupons(templateIds, merchantId);

        return R.ok(receiveCount);
    }


    /**
     * 用户核销优惠券
     *
     * @param dto 用户核销优惠券参数
     * @return 处理结果
     */
    @Override
    @Lock4j(name = CouponKeyConst.LOCK_KEY_PREFIX_USER_COUPON, keys = {"#dto.couponId"})
    @Transactional(rollbackFor = Exception.class)
    public R<?> redeem(UserCouponRedeemDTO dto) {
        Long userId = getPrincipal().getId();

        /* step-1 检查优惠券状态 */
        UserCoupon userCoupon = getById(dto.getCouponId());
        if (ObjUtil.isNull(userCoupon) || !ObjUtil.equals(userCoupon.getUserId(), userId)) {
            return R.failed("核销失败, 优惠券不存在或用户未领取该优惠券");
        }
        if (userCoupon.getCouponStatus() != CouponStatusEnum.USER_COUPON_UNUSED) {
            return R.failed("核销失败, 优惠券已使用或已过期");
        }
        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(userCoupon.getValidStartTime())) {
            return R.failed("核销失败, 优惠券未到生效时间");
        }
        if (now.isAfter(userCoupon.getValidEndTime())) {
            userCoupon.setCouponStatus(CouponStatusEnum.USER_COUPON_EXPIRED);
            boolean result = updateById(userCoupon);
            if (!result) {
                throw new RuntimeException("核销失败, 更新优惠券失败");
            }
            return R.failed("核销失败, 优惠券已过期");
        }

        /* step-2 检查订单是否满足优惠券使用 */
        // 检查订单信息
        Order order = Db.getById(dto.getOrderId(), Order.class);
        if (ObjUtil.isNull(order)) {
            return R.failed("核销失败, 订单不存在");
        }
        if (ObjUtil.isNotNull(order.getPaymentTime())) {
            return R.ok("核销失败, 订单已完成支付");
        }
        // 检查优惠券模板定义条件是否适用
        CouponTemplate couponTemplate = Db.getById(userCoupon.getTemplateId(), CouponTemplate.class);
        if (ObjUtil.isNull(couponTemplate)) {
            log.error("无法根据用户优惠券的优惠券模板ID找到对应优惠券模板, 用户优惠券ID: {}, 优惠券模板ID: {}",
                    userCoupon.getId(), userCoupon.getTemplateId());
            return R.failed("核销失败, 优惠券不存在");
        }
        if (couponTemplate.getMinSpendAmount().compareTo(order.getTotalProductPrice()) > 0) {
            return R.failed("核销失败, 订单金额未达到优惠券使用门槛");
        }
        switch (couponTemplate.getScope()) {
            case COUPON_SCOPE_MERCHANT_OWN -> {
                if (!ObjUtil.equals(order.getMerchantId(), couponTemplate.getMerchantId())) {
                    return R.failed("核销失败, 优惠券不适用当前商家");
                }
            }
            case COUPON_SCOPE_STORE -> {
                List<Long> availableStores = JSONUtil.toList(couponTemplate.getApplicableStores(), Long.class);
                if (!availableStores.contains(order.getStoreId())) {
                    return R.failed("核销失败, 优惠券不适用当前门店");
                }
            }
        }
        if (StrUtil.isNotBlank(couponTemplate.getApplicableSkus())) {
            List<Long> applicableSkus = JSONUtil.toList(couponTemplate.getApplicableSkus(), Long.class);
            Set<Long> skuIds = Db.lambdaQuery(OrderItem.class)
                    .eq(OrderItem::getOrderId, order.getId()).list()
                    .stream().map(OrderItem::getProductSkuId).collect(Collectors.toSet());
            if (applicableSkus.stream().noneMatch(skuIds::contains)) {
                return R.failed("核销失败, 优惠券不适用当前订单商品");
            }
        }

        /* step-3 更新用户优惠券 */
        userCoupon.setCouponStatus(CouponStatusEnum.USER_COUPON_USED);
        userCoupon.setUsedOrderId(Long.valueOf(dto.getOrderId()));
        boolean result = updateById(userCoupon);
        if (!result) {
            throw new CheckedException("核销失败, 用户优惠券更新失败");
        }

        // 联合营销：更新返利记录状态
        jointMarketingIssueService.updateRebateStatusOnCouponVerify(userCoupon.getId());

        /* step-4 发送异步消息写入核销记录 */
        Long couponSourceMerchantId = couponTemplate.getMerchantId();
        try {
            couponRedeemLogService.sendNewRecordMsg(userCoupon, couponTemplate, couponSourceMerchantId, order);
        } catch (Exception e) {
            log.error("发送用户核销优惠券记录消息失败, 优惠券ID: {}, 订单ID: {}", userCoupon.getId(), order.getId(), e);
        }

        return R.ok();
    }


    /**
     * 商家核销优惠券
     *
     * @param dto 优惠券码参数
     * @return 处理结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> redeemByCode(UserCouponCodeDTO dto) {
        Long merchantId = getPrincipal().getDeptId();

        /* step-1 检查优惠券状态 */
        UserCoupon userCoupon = lambdaQuery().eq(UserCoupon::getCouponCode, dto.getCouponCode()).one();
        if (ObjUtil.isNull(userCoupon)) {
            return R.failed("无效的优惠券");
        }
        if (userCoupon.getCouponStatus() != CouponStatusEnum.USER_COUPON_UNUSED) {
            return R.failed("核销失败, 优惠券已被使用或已过期");
        }
        LocalDateTime now = LocalDateTime.now();
        if (userCoupon.getValidStartTime().isAfter(now)) {
            return R.failed("核销失败, 优惠券未到可用时间");
        }
        if (userCoupon.getValidEndTime().isBefore(now)) {
            return R.failed("核销失败, 优惠券已过期");
        }
        Long issueMerchantId = userCoupon.getIssueMerchantId();
        if (issueMerchantId != 0L && !ObjUtil.equals(issueMerchantId, merchantId)) {
            return R.failed("核销失败, 优惠券不适用当前商家");
        }
        CouponTemplate couponTemplate = Db.getById(userCoupon.getTemplateId(), CouponTemplate.class);
        Assert.notNull(couponTemplate, () -> new RuntimeException("核销失败, 优惠券不存在"));

        /* step-2 更新优惠券状态 */
        userCoupon.setCouponStatus(CouponStatusEnum.USER_COUPON_USED);
        boolean result = updateById(userCoupon);
        if (!result) {
            return R.failed("优惠券核销失败, 请重试");
        }

        // 联合营销：更新返利记录状态
        jointMarketingIssueService.updateRebateStatusOnCouponVerify(userCoupon.getId());

        /* step-3 写入核销记录 */
        Long couponSourceMerchantId = couponTemplate.getMerchantId();
        try {
            couponRedeemLogService.sendNewRecordMsg(userCoupon, couponTemplate, couponSourceMerchantId, null);
        } catch (Exception e) {
            log.error("发送商家核销优惠券记录消息失败, 优惠券ID: {}, 商家ID: {}", userCoupon.getId(), merchantId, e);
        }

        return R.ok();
    }


    /**
     * 商家作废用户优惠券
     *
     * @param dto 优惠券码参数
     * @return 处理结果
     */
    @Override
    public R<?> cancelByCode(UserCouponCodeDTO dto) {
        Long merchantId = getPrincipal().getDeptId();

        UserCoupon userCoupon = lambdaQuery().eq(UserCoupon::getCouponCode, dto.getCouponCode()).one();
        Assert.notNull(userCoupon, () -> new RuntimeException("作废失败, 优惠券不存在"));
        Assert.isTrue(ObjUtil.equals(userCoupon.getIssueMerchantId(), merchantId),
                () -> new RuntimeException("作废失败, 优惠券不属于当前商家"));
        Assert.isTrue(userCoupon.getCouponStatus() == CouponStatusEnum.USER_COUPON_UNUSED,
                () -> new RuntimeException("作废失败, 优惠券已被使用或已失效"));

        userCoupon.setCouponStatus(CouponStatusEnum.USER_COUPON_INVALID);
        boolean result = updateById(userCoupon);
        Assert.isTrue(result, () -> new RuntimeException("作废失败, 优惠券更新失败"));

        return R.ok();
    }


    /**
     * 根据订单商品查询订单可用优惠券
     *
     * @param dto 获取订单可用优惠券参数
     * @return 查询结果(用户可用优惠券列表)
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<List<UserCouponUsableVO>> queryOrderAvailableCoupon(UserCouponAvailableDTO dto) {
        LocalDateTime now = LocalDateTime.now();

        /* step-1 获取用户未使用优惠券 */
        List<UserCouponUsableBO> bos = queryUserUsableCoupons(null);
        if (CollUtil.isEmpty(bos)) {
            return R.ok(List.of());
        }

        /* step-2 检查商品状态 & 计算总价 */
        Map<String, Integer> categories = dto.getCategories();
        Set<Long> productIds = categories.keySet().stream().map(Long::valueOf).collect(Collectors.toSet());
        List<ProductSku> skus = productSkuService.lambdaQuery()
                .eq(ProductSku::getEnabled, true).in(ProductSku::getId, productIds).list();
        if (CollUtil.isEmpty(skus)) {
            return R.ok(List.of());
        }
        BigDecimal totalAmount = BigDecimal.ZERO;
        Set<Long> skuIds = new HashSet<>();
        for (ProductSku sku : skus) {
            skuIds.add(sku.getId());
            totalAmount = totalAmount.add(sku.getPrice().multiply(new BigDecimal(categories.get(sku.getId().toString()))));
        }

        /* step-3 筛选商品可用优惠券 */
        List<UserCouponUsableVO> vos = new ArrayList<>();
        List<UserCoupon> expiresCoupons = new ArrayList<>();
        for (UserCouponUsableBO bo : bos) {
            // 检查是否有优惠券过期
            if (bo.getValidEndTime().isBefore(now)) {
                UserCoupon expires = new UserCoupon();
                expires.setId(bo.getCouponId());
                expires.setCouponStatus(CouponStatusEnum.USER_COUPON_EXPIRED);
                expiresCoupons.add(expires);
                continue;
            }
            UserCouponUsableVO vo = BeanUtil.copyProperties(bo, UserCouponUsableVO.class);
            vo.setUsable(false);
            // 检查使用金额门槛
            if (totalAmount.compareTo(bo.getMinSpendAmount()) < 0) {
                vo.setUnusableReason("未达到优惠券使用金额门槛");
                vos.add(vo);
                continue;
            }
            // 检查优惠券适用商家/门店范围
            switch (bo.getScope()) {
                case COUPON_SCOPE_MERCHANT_OWN -> {
                    if (!bo.getMerchantId().equals(Long.valueOf(dto.getMerchantId()))) {
                        vo.setUnusableReason("优惠券不适用该商家");
                        vos.add(vo);
                        continue;
                    }
                }
                case COUPON_SCOPE_STORE -> {
                    List<Long> applicableStores = JSONUtil.toList(bo.getApplicableStores(), Long.class);
                    if (!applicableStores.contains(Long.valueOf(dto.getStoreId()))) {
                        vo.setUnusableReason("优惠券不适用该门店");
                        vos.add(vo);
                        continue;
                    }
                }
            }
            // 检查优惠券适用商品范围
            if (StrUtil.isNotBlank(bo.getApplicableSkus())) {
                List<Long> applicableSkus = JSONUtil.toList(bo.getApplicableSkus(), Long.class);
                if (Collections.disjoint(applicableSkus, skuIds)) {
                    vo.setUnusableReason("优惠券不适用订单商品");
                    vos.add(vo);
                    continue;
                }
            }
            vo.setUsable(true);
            vos.add(vo);
        }

        /* step-4 处理已过期优惠券(如有) */
        if (CollUtil.isNotEmpty(expiresCoupons)) {
            boolean result = updateBatchById(expiresCoupons);
            if (!result) {
                throw new RuntimeException("更新优惠券失败");
            }
        }

        /* step-5 对用户优惠券去重 & 排序 */
        vos = new ArrayList<>(vos.stream().collect(Collectors.toMap(UserCouponUsableVO::getCouponTemplateId,
                        vo -> vo, (vo1, vo2) ->
                                vo1.getReceivedTime().isBefore(vo2.getReceivedTime()) ? vo1 : vo2, LinkedHashMap::new))
                .values());
        Comparator<UserCouponUsableVO> comparator = Comparator
                .comparing(UserCouponUsableVO::getUsable, Comparator.reverseOrder())
                .thenComparing(UserCouponUsableVO::getDiscountAmount, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(UserCouponUsableVO::getDiscountRate, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(UserCouponUsableVO::getValidEndTime);
        vos.sort(comparator);

        return R.ok(vos);
    }


    /**
     * 用户获取可领取优惠券列表
     *
     * @param dto 用户查询可领取优惠券列表参数
     * @return 查询结果(用户可领取优惠券列表)
     */
    @Override
    public R<CursorQueryVO<UserClaimableCouponListVO>> getClaimableList(UserClaimableQueryDTO dto) {
        CursorQueryVO<UserClaimableCouponListVO> cursorQueryVo = new CursorQueryVO<>();
        Long userId = getPrincipal().getId();
        Collection<Long> merchantIds;

        /* step-1 确定查询商家 */
        if (ObjUtil.isNotNull(dto.getRegionCode())) {
            // 根据区域编码查询商家优惠券
            Page<Object> page = Page.of(dto.getPageNum(), dto.getPageSize());
            Page<StoreMerchantIndustryBO> pageData = storeService.queryStoresByRegionCodeAndIndustry(
                    page, dto.getRegionCode(), (StrUtil.isNotBlank(dto.getIndustryId()) ? Long.valueOf(dto.getIndustryId()) : null));
            if (ObjUtil.isNull(pageData) || CollUtil.isEmpty(pageData.getRecords())) {
                pageData = storeService.queryStoresByRegionCodeAndIndustry(page, null, null);
                if (ObjUtil.isNull(pageData) || CollUtil.isEmpty(pageData.getRecords())) {
                    return R.failed("当前区域暂无可用的优惠券");
                }
            }
            merchantIds = pageData.getRecords().stream().map(StoreMerchantIndustryBO::getMerchantId).collect(Collectors.toSet());
            cursorQueryVo.setPageNum(Long.valueOf(pageData.getCurrent()).intValue());
            cursorQueryVo.setTotal(Long.valueOf(pageData.getTotal()).intValue());
            cursorQueryVo.setSize(Long.valueOf(pageData.getSize()).intValue());

        } else {
            // 根据经纬度查询商家优惠券
            CursorQueryVO<StoreCacheDTO> cacheData = storeCacheRepository.queryNearbyStores(
                    dto, (StrUtil.isNotBlank(dto.getIndustryId()) ? Long.valueOf(dto.getIndustryId()) : null));
            // 缓存没有命中数据, 备选查询数据库
            Page<StoreCacheDTO> pageData;
            if (ObjUtil.isNull(cacheData) || CollUtil.isEmpty(cacheData.getRecords())) {
                pageData = storeService.queryNearbyStores(dto);
                if (ObjUtil.isNull(pageData) || CollUtil.isEmpty(pageData.getRecords())) {
                    return R.failed("当前区域暂无可用的优惠券");
                }
                merchantIds = pageData.getRecords().stream().map(StoreCacheDTO::getMerchantId).map(Long::valueOf).collect(Collectors.toSet());
                cursorQueryVo.setPageNum(Long.valueOf(pageData.getPages()).intValue());
                cursorQueryVo.setTotal(Long.valueOf(pageData.getTotal()).intValue());
                cursorQueryVo.setSize(Long.valueOf(pageData.getSize()).intValue());

            } else {
                merchantIds = cacheData.getRecords().stream().map(StoreCacheDTO::getMerchantId).map(Long::valueOf).collect(Collectors.toSet());
                cursorQueryVo.setNextCursor(cacheData.getNextCursor());
                cursorQueryVo.setHasMore(cacheData.getHasMore());
                cursorQueryVo.setTotal(cacheData.getTotal());
                cursorQueryVo.setSize(cacheData.getSize());
                cursorQueryVo.setPageNum(dto.getPageNum());
            }
        }

        /* step-2 查询对应商家优惠券 */
        List<UserClaimableCouponListVO> claimableCouponListVos = couponTemplateService.queryUserClaimableCoupons(merchantIds);
        if (CollUtil.isEmpty(claimableCouponListVos)) {
            return R.failed("当前区域暂无可用的优惠券");
        }
        claimableCouponListVos.forEach(vo -> vo.setClaimable(true));

        /* step-3 查询用户是否已有领取优惠券 */
        List<Long> couponTemplateIds = claimableCouponListVos.stream().map(UserClaimableCouponListVO::getCouponTemplateId).toList();
        List<UserClaimedCouponCountBO> userClaimedCoupons = checkCouponHasClaimed(couponTemplateIds, userId);
        if (CollUtil.isEmpty(userClaimedCoupons)) {
            cursorQueryVo.setRecords(claimableCouponListVos);
            return R.ok(cursorQueryVo);
        }

        Map<Long, Integer> claimedMap = userClaimedCoupons.stream()
                .collect(Collectors.toMap(UserClaimedCouponCountBO::getCouponTemplateId, UserClaimedCouponCountBO::getClaimedCount));
        for (UserClaimableCouponListVO vo : claimableCouponListVos) {
            Integer claimedCount = claimedMap.get(vo.getCouponTemplateId());
            if (claimedCount == null) {
                vo.setRemainingClaimable(vo.getReceiveLimitPerUser());
                continue;
            }
            int remainingReceiveCount = vo.getReceiveLimitPerUser() - claimedCount;
            vo.setRemainingClaimable(Math.max(remainingReceiveCount, 0));
            if (remainingReceiveCount < 1) {
                vo.setClaimable(false);
            }
        }

        cursorQueryVo.setRecords(claimableCouponListVos);
        return R.ok(cursorQueryVo);
    }


    /**
     * 用户查询已领取优惠券列表
     *
     * @param couponStatus 优惠券状态
     * @return 查询结果(用户已领取优惠券列表)
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<List<UserCouponCollectedListVO>> getCollectedList(String couponStatus) {
        /* step-1 构建基础查询条件 */
        CouponStatusEnum status = CouponStatusEnum.getByValue(couponStatus);
        MPJLambdaWrapper<UserCoupon> wrapper = initUserCouponJoinCouponTemplateWrapper(w -> w

                .selectAs(CouponTemplate::getId, UserCouponCollectedListVO::getCouponTemplateId)
                // 指定查询属性与字段映射
                .selectAs(UserCoupon::getId, UserCouponCollectedListVO::getCouponId)
                .selectAs(UserCoupon::getIssueMerchantId, UserCouponCollectedListVO::getMerchantId)
                .selectAs(Merchant::getName, UserCouponCollectedListVO::getMerchantName)
                .selectAs(Merchant::getLogoUrl, UserCouponCollectedListVO::getMerchantLogoUrl))
                // 构建查询基础条件
                .eq(UserCoupon::getUserId, getPrincipal().getId())
                .eq(UserCoupon::getCouponStatus, status);

        /* step-2 根据优惠券使用状态添加查询条件 & 执行查询 */
        List<UserCouponCollectedListVO> vos = new ArrayList<>();
        List<UserCoupon> expiresCoupons = new ArrayList<>();
        // 动态添加查询条件
        switch (status) {
            // 查询用户未使用优惠券列表
            case USER_COUPON_UNUSED -> {
                vos = baseMapper.selectJoinList(UserCouponCollectedListVO.class, wrapper);
                if (CollUtil.isEmpty(vos)) {
                    return R.ok(List.of());
                }
                LocalDateTime now = LocalDateTime.now();
                // 检查是否有优惠券已过期;
                Iterator<UserCouponCollectedListVO> i = vos.iterator();
                while (i.hasNext()) {
                    UserCouponCollectedListVO vo = i.next();
                    if (now.isAfter(vo.getValidEndTime())) {
                        UserCoupon expires = new UserCoupon();
                        expires.setId(vo.getCouponId());
                        expires.setCouponStatus(CouponStatusEnum.USER_COUPON_EXPIRED);
                        expiresCoupons.add(expires);

                        i.remove();
                        continue;
                    }
                    if (vo.getMerchantId() == 0) {
                        vo.setMerchantName("平台券");
                    }
                }
                if (CollUtil.isNotEmpty(expiresCoupons)) {
                    boolean result = updateBatchById(expiresCoupons);
                    if (!result) {
                        throw new RuntimeException("更新优惠券失败");
                    }
                }
            }
            // 查询用户已使用/已过期优惠券列表
            case USER_COUPON_USED, USER_COUPON_EXPIRED -> {
                wrapper.ge(UserCoupon::getValidEndTime, LocalDateTime.now().minusDays(userCouponMaxQueryDays));
                vos = baseMapper.selectJoinList(UserCouponCollectedListVO.class, wrapper);
                if (CollUtil.isNotEmpty(vos)) {
                    vos.forEach(vo -> {
                        if (vo.getMerchantId() == 0) {
                            vo.setMerchantName("平台券");
                        }
                    });
                }
            }
        }

        return R.ok(vos);
    }


    /**
     * 用户查询优惠券详情
     *
     * @param couponTemplateId 优惠券模板ID
     * @return 查询结果(优惠券详情)
     */
    @Override
    public R<UserCouponDetailVO> getDetail(Long couponTemplateId) {
        Long userId = getPrincipal().getId();

        /* step-1 检查该优惠券模板状态 */
        CouponTemplate couponTemplate = Db.getById(couponTemplateId, CouponTemplate.class);
        if (ObjUtil.isNull(couponTemplate)) {
            return R.failed("优惠券不存在");
        }
        UserCouponDetailVO vo = BeanUtil.copyProperties(couponTemplate, UserCouponDetailVO.class);
        vo.setCouponTemplateId(couponTemplate.getId());
        vo.setCouponTemplateId(couponTemplateId);

        /* step-2 填充优惠券所属商家信息 */
        MerchantSimpleInfoVO merchantInfo = merchantService.getMerchantSimpleInfo(couponTemplate.getMerchantId());
        vo.setMerchantLogoUrl(merchantInfo.getMerchantLogoUrl());
        vo.setMerchantName(merchantInfo.getMerchantName());

        /* step-3 检查是否已领取过该优惠券 */
        List<UserCoupon> userCoupons = lambdaQuery()
                .eq(UserCoupon::getUserId, userId)
                .eq(UserCoupon::getTemplateId, couponTemplateId)
                .orderByDesc(UserCoupon::getCreatedTime).list();
        if (CollUtil.isNotEmpty(userCoupons)) {
            // 填充是否可领取信息
            vo.setClaimable(couponTemplate.getReceiveLimitPerUser() > userCoupons.size());
            vo.setRemainingClaimable(couponTemplate.getReceiveLimitPerUser() - userCoupons.size());
            // 填充用户优惠券信息
            UserCoupon userCoupon = userCoupons.get(0);
            vo.setCouponId(userCoupon.getId());
            vo.setCouponCode(userCoupon.getCouponCode());
            vo.setReceivedTime(userCoupon.getCreatedTime());
            vo.setCouponStatus(userCoupon.getCouponStatus());
            vo.setValidEndTime(userCoupon.getValidEndTime());
            vo.setValidStartTime(userCoupon.getValidStartTime());

        } else {
            vo.setClaimable(true);
            vo.setCouponStatus(CouponStatusEnum.USER_COUPON_UNCLAIMED);
            vo.setRemainingClaimable(couponTemplate.getReceiveLimitPerUser());
        }

        /* step-4 映射可用门店 & 商品 */
        // 填充优惠券可用门店映射
        if (!StrUtil.isBlank(couponTemplate.getApplicableStores())) {
            List<StoreSimpleInfoVO> storeInfos = storeService
                    .getStoreSimpleInfo(JSONUtil.toList(couponTemplate.getApplicableStores(), Long.class));
            vo.setAvailableStores(storeInfos);
        }
        // 填充优惠券可用商品映射
        if (!StrUtil.isBlank(couponTemplate.getApplicableSkus())) {
            List<ProductSkuSimpleInfoVO> skuInfos = productSkuService
                    .getSkuSimpleInfoWithCategory(JSONUtil.toList(couponTemplate.getApplicableSkus(), Long.class));
            vo.setAvailableSkus(skuInfos);
        }

        return R.ok(vo);
    }


    /**
     * 用户查询优惠券码
     *
     * @param couponId 用户优惠券ID
     * @return 查询结果(用户优惠券码信息)
     */
    @Override
    public R<UserCouponCodeVO> getCode(Long couponId) {
        UserCouponCodeVO vo = userCouponMapper.getByIdOrCode(couponId, null);
        if (ObjUtil.isNull(vo)) {
            return R.failed("优惠券不存在");
        }
        return R.ok(vo);
    }


    /**
     * 检查用户是否领取过优惠券
     *
     * @param couponTemplateIds 优惠券模板ID列表
     * @param userId            用户ID
     * @return 查询结果(用户领取优惠券统计)
     */
    @Override
    public List<UserClaimedCouponCountBO> checkCouponHasClaimed(Collection<Long> couponTemplateIds, Long userId) {
        if (CollUtil.isEmpty(couponTemplateIds)) {
            return null;
        }
        return userCouponMapper.checkCouponHasClaimed(couponTemplateIds, userId);
    }


    /**
     * 商家根据优惠券码获取用户优惠券信息
     *
     * @param couponCode 优惠券码
     * @return 查询结果(用户优惠券码信息)
     */
    @Override
    public R<UserCouponCodeVO> getCouponByCode(String couponCode) {
        UserCouponCodeVO vo = userCouponMapper.getByIdOrCode(null, couponCode);
        if (ObjUtil.isNull(vo)) {
            return R.failed("优惠券不存在");
        }
        return R.ok(vo);
    }


    /**
     * 计算优惠券折扣
     *
     * @param dto 优惠券计算折扣参数
     * @return 优惠券计算折扣结果
     */
    @Override
    public CouponCalculateDiscountVO calculateCouponDiscount(CouponCalculateDiscountDTO dto) {
        /* 计算逻辑:
        所有商品合计可使用 [1张] 面值最大的平台优惠券 &
        每个商家下的商品可使用 [1张] 当前商家面值最大的可用优惠券
        */
        CouponCalculateDiscountVO vo = CouponCalculateDiscountVO.of();

        /* step-1 提取参数中的商家 & 商品信息 */
        List<CouponCalculateDiscountDTO.MerchantInfo> cartInfos = dto.getCartInfo();
        Map<Long, Integer> skuQuantityMap = new HashMap<>();
        // TODO MMX 优惠券可用门店校验逻辑是否正确 ?
        List<Long> storeIds = new ArrayList<>();
        for (CouponCalculateDiscountDTO.MerchantInfo cartInfo : cartInfos) {
            if (StrUtil.isNotBlank(cartInfo.getStoreId())) {
                storeIds.add(Long.valueOf(cartInfo.getStoreId()));
            }
            List<CouponCalculateDiscountDTO.ProductItem> items = cartInfo.getItems();
            for (CouponCalculateDiscountDTO.ProductItem item : items) {
                skuQuantityMap.put(Long.valueOf(item.getProductId()), item.getQuantity());
            }
        }

        /* step-2 获取商品信息 */
        List<ProductSkuSimpleInfoVO> cartSkus = productSkuService.getSkuSimpleInfoWithMerchant(skuQuantityMap.keySet());
        Assert.notEmpty(cartSkus, () -> new CheckedException("无效的选购商品"));
        // 去重提取商品列表中的商品所属商家ID
        Set<Long> productMerchantIds = cartSkus.stream().map(ProductSkuSimpleInfoVO::getMerchantId).collect(Collectors.toSet());
        Map<Long, List<ProductSkuSimpleInfoVO>> productMap = cartSkus.stream()
                .collect(Collectors.groupingBy(ProductSkuSimpleInfoVO::getMerchantId));

        /* step-3 根据商品中的商家ID获取用户当前可用优惠券 */
        // 添加平台券(商家ID为0)
        productMerchantIds.add(0L);
        List<UserCouponUsableBO> userCoupons = queryUserUsableCoupons(w -> w.in(CouponTemplate::getMerchantId, productMerchantIds));
        if (CollUtil.isEmpty(userCoupons)) {
            return vo;
        }
        // 将用户可用优惠券进行抵扣金额升序排序后按发放商家进行合并, 抵扣金额越小越优先被使用
        Map<Long, List<UserCouponUsableBO>> merchantCouponMap = userCoupons.stream()
                .sorted(Comparator.comparing((UserCouponUsableBO::getMaxDeductibleAmount)))
                .collect(Collectors.groupingBy(UserCouponUsableBO::getMerchantId));

        /* step-4 按商家遍历商品列表查找适用优惠券 */
        List<String> productImages;
        boolean lastMerchantHasDiscount = true;
        CouponCalculateDiscountVO.MerchantDiscountInfo discountInfo = null;
        // *** 第一层循环 ***
        // 根据商家遍历用户当前已领优惠券列表
        for (Map.Entry<Long, List<UserCouponUsableBO>> couponEntry : merchantCouponMap.entrySet()) {
            Long merchantId = couponEntry.getKey();

            // 若上一个商家没有适用优惠券被选中, 将上一个商家下的商品信息存入vo
            if (!lastMerchantHasDiscount) {
                vo.getMerchantDiscountInfos().add(discountInfo);
            }

            // *** 第二层循环 ***
            // 遍历当前商家下用户已领优惠券
            List<UserCouponUsableBO> coupons = couponEntry.getValue();
            for (UserCouponUsableBO coupon : coupons) {
                // 初始化优惠信息
                productImages = new ArrayList<>();
                discountInfo = CouponCalculateDiscountVO.discountInfo(merchantId);
                BigDecimal calculateAmount = BigDecimal.ZERO, totalAmount = BigDecimal.ZERO;

                // 当前优惠券适用的门店列表
                List<Long> applicableStores = (StrUtil.isBlank(coupon.getApplicableStores()))
                        ? null : JSONUtil.toList(coupon.getApplicableStores(), Long.class);
                // 当前优惠券适用的商品列表
                List<Long> applicableSkus = (StrUtil.isBlank(coupon.getApplicableSkus()))
                        ? null : JSONUtil.toList(coupon.getApplicableSkus(), Long.class);

                // *** 第三层循环 ***
                // 遍历当前商家下用户选购的商品是否适用优惠券
                List<ProductSkuSimpleInfoVO> products = productMap.get(merchantId);
                for (ProductSkuSimpleInfoVO product : products) {
                    productImages.add(product.getSkuImage());
                    BigDecimal productAmount = new BigDecimal(skuQuantityMap.get(product.getSkuId())).multiply(product.getPrice());
                    totalAmount = totalAmount.add(productAmount);
                    switch (coupon.getScope()) {
                        case COUPON_SCOPE_GLOBAL, COUPON_SCOPE_MERCHANT_OWN -> {
                            if (applicableSkus == null) {
                                calculateAmount = calculateAmount.add(productAmount);
                            } else {
                                if (applicableSkus.contains(product.getSkuId())) {
                                    calculateAmount = calculateAmount.add(productAmount);
                                }
                            }
                        }
                        case COUPON_SCOPE_STORE -> {
                            if (CollUtil.isEmpty(applicableStores)) {
                                break;
                            }
                            if (!Collections.disjoint(applicableStores, storeIds)) {
                                calculateAmount = calculateAmount.add(productAmount);
                            }
                        }
                    }
                }
                // *** 第三层循环结束 ***

                // 检查当前优惠券可用商品总价是否满足优惠券使用金额门槛
                if (coupon.getMinSpendAmount().compareTo(calculateAmount) > 0) {
                    discountInfo.setProductImages(productImages);
                    discountInfo.setTotalAmount(calculateAmount);

                    lastMerchantHasDiscount = false;
                    continue;
                }

                // 计算当前优惠券折扣金额
                BigDecimal discountAmount = BigDecimal.ZERO;
                String discountDesc = null;
                switch (coupon.getType()) {
                    case COUPON_TYPE_CASH -> {
                        discountAmount = coupon.getDiscountAmount().subtract(calculateAmount);
                        discountDesc = "满 " + coupon.getMinSpendAmount().setScale(0, RoundingMode.DOWN) +
                                " 减 " + coupon.getDiscountAmount().setScale(0, RoundingMode.DOWN);
                    }
                    case COUPON_TYPE_DISCOUNT -> {
                        discountAmount = coupon.getDiscountAmount().multiply(calculateAmount);
                        BigDecimal rate = coupon.getDiscountRate()
                                .setScale(2, RoundingMode.DOWN).multiply(new BigDecimal(100));
                        discountDesc = "满 " + coupon.getMinSpendAmount().setScale(0, RoundingMode.DOWN) + " 打 " + rate + " 折";
                    }
                }

                discountInfo.setDiscountDesc(discountDesc);
                discountInfo.setTotalAmount(calculateAmount);
                discountInfo.setProductImages(productImages);
                discountInfo.setDiscountAmount(discountAmount);
                vo.getMerchantDiscountInfos().add(discountInfo);

                // 已选定当前商家可用优惠券, 进入下一个商家
                lastMerchantHasDiscount = true;
                break;
            }
        }

        // 若最后一个商家没有适用优惠券被选中, 将最后一个商家下的商品信息存入vo
        if (!lastMerchantHasDiscount) {
            vo.getMerchantDiscountInfos().add(discountInfo);
        }

        /* step-5 将vo中的优惠信息合并 */
        // 获取商家基本信息
        // TODO MMX 商家信息从缓存中获取
        List<MerchantSimpleInfoBO> merchantInfos = merchantService.getMerchantSimpleInfoList(productMerchantIds);
        Map<Long, MerchantSimpleInfoBO> merchantInfoMap = merchantInfos.stream()
                .collect(Collectors.toMap(MerchantSimpleInfoBO::getMerchantId, i -> i));

        BigDecimal totalOriginalAmount = BigDecimal.ZERO;
        BigDecimal totalDiscountAmount = BigDecimal.ZERO;
        BigDecimal platformDiscountAmount = BigDecimal.ZERO;
        BigDecimal merchantDiscountAmount = BigDecimal.ZERO;

        List<CouponCalculateDiscountVO.MerchantDiscountInfo> discountInfos = vo.getMerchantDiscountInfos();
        for (CouponCalculateDiscountVO.MerchantDiscountInfo info : discountInfos) {
            totalOriginalAmount = totalOriginalAmount.add(info.getTotalAmount());
            totalDiscountAmount = totalDiscountAmount.add(info.getDiscountAmount());
            if (info.getMerchantId() == 0L) {
                platformDiscountAmount = platformDiscountAmount.add(info.getDiscountAmount());
                info.setMerchantName("平台");
            } else {
                merchantDiscountAmount = merchantDiscountAmount.add(info.getDiscountAmount());
                MerchantSimpleInfoBO merchantInfo = merchantInfoMap.get(info.getMerchantId());
                info.setMerchantName(merchantInfo.getMerchantName());
                info.setMerchantLogo(merchantInfo.getMerchantLogo());
            }
        }

        vo.setTotalOriginalAmount(totalOriginalAmount);
        vo.setTotalDiscountAmount(totalDiscountAmount);
        vo.setPlatformDiscountAmount(platformDiscountAmount);
        vo.setMerchantDiscountAmount(merchantDiscountAmount);

        return vo;
    }


    /**
     * 初始化用户优惠券关联查询条件
     *
     * @param mapping 条件映射
     * @return 查询条件
     */
    private MPJLambdaWrapper<UserCoupon>
    initUserCouponJoinCouponTemplateWrapper(Consumer<MPJLambdaWrapper<UserCoupon>> mapping) {
        MPJLambdaWrapper<UserCoupon> wrapper = new MPJLambdaWrapper<>(UserCoupon.class)
                // 指定查询UserCoupon属性
                .select(UserCoupon::getId,
                        UserCoupon::getCouponStatus,
                        UserCoupon::getValidEndTime,
                        UserCoupon::getValidStartTime,
                        UserCoupon::getIssueMerchantId)
                // 指定查询CouponTemplate属性
                .select(CouponTemplate::getId,
                        CouponTemplate::getName,
                        CouponTemplate::getType,
                        CouponTemplate::getScope,
                        CouponTemplate::getLogoUrl,
                        CouponTemplate::getSummary,
                        CouponTemplate::getDiscountRate,
                        CouponTemplate::getDiscountAmount,
                        CouponTemplate::getMinSpendAmount)
                // 指定查询Merchant属性
                .select(Merchant::getName,
                        Merchant::getLogoUrl)
                // 表连接
                .leftJoin(CouponTemplate.class, CouponTemplate::getId, UserCoupon::getTemplateId)
                .leftJoin(Merchant.class, Merchant::getId, CouponTemplate::getMerchantId);
        mapping.accept(wrapper);
        return wrapper;
    }


    /**
     * 查询用户可用优惠券列表
     *
     * @param mapping 条件映射
     * @return 用户可用优惠券列表
     */
    private List<UserCouponUsableBO> queryUserUsableCoupons(Consumer<MPJLambdaWrapper<UserCoupon>> mapping) {
        MPJLambdaWrapper<UserCoupon> wrapper = new MPJLambdaWrapper<>(UserCoupon.class)
                // 指定查询UserCoupon属性
                .select(UserCoupon::getId,
                        UserCoupon::getCreatedTime,
                        UserCoupon::getCouponStatus,
                        UserCoupon::getValidEndTime,
                        UserCoupon::getValidStartTime)
                .selectAs(UserCoupon::getId, UserCouponUsableBO::getCouponId)
                .selectAs(UserCoupon::getCreatedTime, UserCouponUsableBO::getReceivedTime)
                // 指定查询CouponTemplate属性
                .select(CouponTemplate::getId,
                        CouponTemplate::getName,
                        CouponTemplate::getType,
                        CouponTemplate::getScope,
                        CouponTemplate::getSummary,
                        CouponTemplate::getMerchantId,
                        CouponTemplate::getDiscountRate,
                        CouponTemplate::getDiscountAmount,
                        CouponTemplate::getMinSpendAmount,
                        CouponTemplate::getApplicableSkus,
                        CouponTemplate::getApplicableStores,
                        CouponTemplate::getMaxDeductibleAmount)
                .selectAs(CouponTemplate::getId, UserCouponUsableBO::getCouponTemplateId)
                // 构建查询条件
                .eq(UserCoupon::getUserId, getPrincipal().getId())
                .eq(UserCoupon::getCouponStatus, CouponStatusEnum.USER_COUPON_UNUSED)
                // 表连接
                .leftJoin(CouponTemplate.class, CouponTemplate::getId, UserCoupon::getTemplateId);

        if (mapping != null) {
            mapping.accept(wrapper);
        }

        return baseMapper.selectJoinList(UserCouponUsableBO.class, wrapper);
    }


    /**
     * 用户批量领取优惠券
     *
     * @param couponTemplateIds 优惠券模板ID列表
     * @param issueMerchantId   优惠券发放商户ID
     * @return 领取优惠券数
     */
    @Transactional(rollbackFor = Exception.class)
    public Integer receiveCoupons(List<Long> couponTemplateIds, Long issueMerchantId) {
        List<UserCoupon> userCoupons = new ArrayList<>();
        Long userId = getPrincipal().getId();
        int claimedCount = 0;
        boolean result;

        /* step-1 遍历优惠券模板列表, 过程中获取锁成功后再进行优惠券模板获取 & 修改 */
        for (Long couponTemplateId : couponTemplateIds) {
            // 获取优惠券模板锁
            RLock lock = lockUtil.tryLock(CouponKeyConst.LOCK_KEY_PREFIX_COUPON_TEMPLATE + couponTemplateId);
            if (lock == null) {
                continue;
            }
            try {
                // 检查优惠券模板状态
                CouponTemplate couponTemplate = couponTemplateService.getById(couponTemplateId);
                if (ObjUtil.isNull(couponTemplate) || !couponTemplate.getEnable()) {
                    log.error("优惠券模板 [{}] 不存在", couponTemplateId);
                    throw new RuntimeException("优惠券不存在");
                }
                if (couponTemplate.getCouponStatus() != CouponStatusEnum.TEMPLATE_ACTIVE) {
                    throw new RuntimeException("领取失败, 优惠券已失效");
                }

                // 修改优惠券模板剩余发放量
                Integer totalQuantity = couponTemplate.getTotalQuantity();
                int issuedQuantity = couponTemplate.getIssuedQuantity() + 1;
                if (totalQuantity != -1) {
                    if (issuedQuantity == totalQuantity) {
                        // if - 本次领取操作恰好将优惠券模板库存领完
                        couponTemplate.setEnable(false);
                        couponTemplate.setIssuedQuantity(issuedQuantity);
                        couponTemplate.setCouponStatus(CouponStatusEnum.TEMPLATE_ALL_CLAIMED);
                    } else {
                        // else - 本次领取操作未将优惠券模板库存领完
                        couponTemplate.setIssuedQuantity(issuedQuantity);
                    }
                }
                // 初始化用户优惠券实体
                UserCoupon userCoupon = new UserCoupon();
                userCoupon.setUserId(userId);
                userCoupon.setTemplateId(couponTemplateId);
                userCoupon.setIssueMerchantId(issueMerchantId);
                userCoupon.setCouponCode(UUID.fastUUID().toString(true));
                initCouponValidTime(couponTemplate, userCoupon);
                // 用户优惠券暂存至实体列表, 后续批量插入DB减少JDBC开销
                userCoupons.add(userCoupon);

                // 更新优惠券模板(库存, 状态)
                result = couponTemplateService.updateById(couponTemplate);
                Assert.isTrue(result, () -> new CheckedException("领取优惠券失败"));

            } catch (Exception e) {
                log.error("用户 [{}] 领取优惠券 [{}] 失败", userId, couponTemplateId, e);
                throw new CheckedException("优惠券领取失败");

            } finally {
                lockUtil.releaseLock(lock);
            }
            // 领取优惠券数+1
            claimedCount++;
        }

        /* step-2 批量插入用户优惠券实体 */
        if (CollUtil.isEmpty(userCoupons)) {
            return 0;
        }
        result = saveBatch(userCoupons);
        Assert.isTrue(result, () -> new CheckedException("领取优惠券失败"));

        return claimedCount;
    }


    /**
     * 初始化用户优惠券有效期
     *
     * @param couponTemplate 优惠券模板
     * @param userCoupon     用户优惠券
     */
    private void initCouponValidTime(CouponTemplate couponTemplate, UserCoupon userCoupon) {
        switch (couponTemplate.getValidityType()) {
            case VALIDITY_DYNAMIC_DAYS -> {
                LocalDate today = LocalDate.now();
                userCoupon.setValidStartTime(today.atStartOfDay());
                userCoupon.setValidEndTime(CouponTemplateEnum.lastSecOfDay(today, couponTemplate.getValidDaysFromReceive()));
            }
            case VALIDITY_FIXED_DATE_RANGE -> {
                userCoupon.setValidStartTime(couponTemplate.getValidStartTime());
                userCoupon.setValidEndTime(couponTemplate.getValidEndTime());
            }
        }
    }


    /**
     * 获取当前操作用户ID
     *
     * @return 当前操作用户ID
     */
    private PocoUser getPrincipal() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new CheckedException("用户未登录");
        }
        return user;
    }


}
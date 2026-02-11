package cn.joywon.poco.merchant.PointsModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.MarketingModule.service.IUserCheckInLogService;
import cn.joywon.poco.merchant.OrderModule.definition.OrderStatusEnum;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.entity.PointsMallOrder;
import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.PointsRule;
import cn.joywon.poco.merchant.PlatformModule.service.IPointsRuleService;
import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsExpireLogBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowBatchRecordBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowRecordBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsAccount;
import cn.joywon.poco.merchant.PointsModule.entity.PointsBatch;
import cn.joywon.poco.merchant.PointsModule.message.sender.PointsMsgSender;
import cn.joywon.poco.merchant.PointsModule.service.*;
import cn.joywon.poco.merchant.PointsModule.vo.PointsBalanceVO;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RefreshScope
@RequiredArgsConstructor
public class UserPointsServiceImpl implements IUserPointsService {

    private final IPointsRuleService pointsRuleService;
    private final IPointsFlowService pointsFlowService;
    private final IPointsBatchService pointsBatchService;
    private final IPointsAccountService pointsAccountService;
    private final IUserCheckInLogService userCheckInLogService;
    private final IPointsExpiryLogService pointsExpiryLogService;

    private final PointsMsgSender pointsMsgSender;


    /**
     * 用户积分增加
     *
     * @param dto 积分增加参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> changeAdd(PointsAddChangeDTO dto) {
        Long userId = Long.valueOf(dto.getPrincipalId());
        boolean result = false;

        /* step-1 检查用户状态 & 积分状态 */
        Long pointsAccountId;
        try {
            pointsAccountId = checkPointsAccount(userId, null).getId();
        } catch (Exception e) {
            return R.failed(e.getMessage());
        }

        /* step-2 根据积分变动类型进行检查 */
        PointsBatch pointsBatch = null;
        Integer validPeriod = dto.getValidPeriod();
        if (validPeriod == null && dto.getValidEndDate() == null) {
            dto.setValidEndTime(PointsEnum.POINTS_NO_EXPIRE_DATE);
        } else {
            dto.setValidEndTime(validPeriod == null
                    ? dto.getValidEndDate().atTime(LocalTime.MAX)
                    : LocalDate.now().plusDays(validPeriod).atTime(LocalTime.MAX));
        }

        PointsEnum changeType = PointsEnum.valueOf(dto.getChangeType());
        switch (changeType) {
            // 消费获得积分
            case ORDER_EARN -> {
                Order orderEntity = Db.getById(dto.getBizId(), Order.class);
                if (ObjUtil.isNull(orderEntity)) {
                    log.error("用户积分增加异常, 用户ID [{}] 对应的编号 [{}] 订单不存在", userId, dto.getBizId());
                    throw new RuntimeException("积分增加失败, 无效的订单编号");
                }
                if (!ObjUtil.equals(orderEntity.getUserId(), userId)) {
                    log.error("用户积分增加异常, 用户ID [{}] 对应的编号 [{}] 用户不一致", userId, dto.getBizId());
                    throw new RuntimeException("积分增加失败, 无效的订单编号");
                }
                if (OrderStatusEnum.valueOf(orderEntity.getStatus()) != OrderStatusEnum.COMPLETED) {
                    log.error("用户积分增加异常, 用户ID [{}] 对应的订单编号 [{}] 不在已完成状态", userId, dto.getBizId());
                    throw new RuntimeException("积分增加失败, 订单不在已完成状态");
                }
//                Integer earnedPoints = orderEntity.getFinalPaidPrice().multiply(BigDecimal.valueOf(pointsMultiple)).intValue();
//                if (!ObjUtil.equals(earnedPoints, dto.getChangePoints())) {
//                    log.error("用户积分增加异常, 用户ID [{}] 对应的订单编号 [{}] 金额与所获积分不一致", userId, dto.getBizId());
//                    throw new RuntimeException("积分增加失败, 积分变动数量有误");
//                }
            }

            // 签到获得积分
            case SIGN_IN_REWARD -> {
                // 检查签到状态
                try {
//                    checkHasSignIn(userId);
                } catch (Exception e) {
                    return R.failed(e.getMessage());
                }
                // 检查是否已有签到批次记录
                pointsBatch = checkInsetOrUpdateSignInPoints(userId);
                if (ObjUtil.isNull(pointsBatch)) {
                    pointsBatch = pointsBatchService.initSignInPointsBatch(dto, userId, PointsEnum.USER);
                } else {
                    pointsBatch = pointsBatchService.renewSignInPointsBatch(dto, pointsBatch, pointsAccountId);
                }
            }
        }

        /* step-3 写入 or 更新批次记录 */
        if (ObjUtil.isNull(pointsBatch)) {
            pointsBatch = pointsBatchService.createPointsBatch(dto, userId, PointsEnum.USER);
        } else {
            result = pointsBatchService.updatePointsBatch(pointsBatch);
        }
        if (ObjUtil.isNull(pointsBatch) || !result) {
            log.error("用户积分增加异常, 用户ID [{}] 对应的变动参数 [{}] 写入批次记录失败", userId, dto);
            return R.failed("积分增加失败, 请稍后重试");
        }

        /* step-4 更新用户积分余额 */
        pointsAccountService.updatePointsAccountBalance(pointsAccountId, dto.getChangePoints());

        /* step-5 异步写入积分流水记录 */
        pointsMsgSender.sendPointsFlowMsg(
                new PointsFlowRecordBO(userId, PointsEnum.USER.getValue(), pointsBatch.getId(), dto)
        );

        return R.ok();
    }


    /**
     * 用户积分变动扣减
     *
     * @param dto 积分扣减参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> changeDed(PointsDedChangeDTO dto) {
        Long userId = Long.valueOf(dto.getPrincipalId());

        /* step-1 清除过期积分(如有) */
        List<PointsBatchDetailBO> expiredPoints = pointsBatchService.clearExpiredPoints(userId, PointsEnum.USER);
        if (!CollUtil.isEmpty(expiredPoints)) {
            recordExpiredPoints(expiredPoints, userId);
        }

        /* step-2 检查用户积分账号状态 */
        Long pointsAccountId;
        try {
            pointsAccountId = checkPointsAccount(userId, dto.getChangePoints()).getId();
        } catch (Exception e) {
            return R.failed(e.getMessage());
        }

        /* step-2 根据积分变动类型进行检查 */
        PointsEnum changeType = PointsEnum.valueOf(dto.getChangeType());
        switch (changeType) {
            // 下单抵扣减少
            case ORDER_SPEND -> {
                Order orderEntity = Db.lambdaQuery(Order.class).eq(Order::getOrderNo, dto.getBizId()).one();
                if (ObjUtil.isNull(orderEntity)) {
                    log.error("用户积分扣减异常, 用户ID [{}] 对应编号 [{}] 的订单不存在", userId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 无效的订单编号");
                }
                if (OrderStatusEnum.getByCode(orderEntity.getStatus()) != OrderStatusEnum.PENDING_PAYMENT) {
                    return R.failed("积分扣减失败, 订单不在待支付状态");
                }
                if (!ObjUtil.equals(orderEntity.getUserId(), userId)) {
                    log.error("用户积分扣减异常, 用户ID [{}] 对应的订单编号 [{}] 用户不一致", userId, orderEntity.getUserId());
                    throw new RuntimeException("积分扣减失败, 无效的订单编号");
                }
                if (orderEntity.getTotalProductPrice().compareTo(BigDecimal.ZERO) <= 0) {
                    log.error("用户积分扣减异常, 用户ID [{}] 对应的订单编号 [{}] 总金额无效", userId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 订单总金额无效");
                }
//                Integer deductedPoints = orderEntity.getTotalProductPrice().multiply(BigDecimal.valueOf(pointsMultiple)).intValue();
//                if (!ObjUtil.equals(deductedPoints, dto.getChangePoints())) {
//                    log.error("用户积分扣减异常, 用户ID [{}] 对应编号 [{}] 的订单扣减数量不一致", userId, dto.getBizId());
//                    throw new RuntimeException("积分扣减失败, 订单扣减积分数量不一致");
//                }
            }
            // 商城兑换减少
            case MALL_REDEEM -> {
                PointsMallOrder orderEntity = Db.getById(dto.getBizId(), PointsMallOrder.class);
                if (ObjUtil.isNull(orderEntity)) {
                    log.error("用户积分扣减异常, 用户ID [{}] 对应编号 [{}] 的积分商城订单不存在", userId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 无效的积分商城订单编号");
                }
                if (!ObjUtil.equals(orderEntity.getUserId(), userId)) {
                    log.error("用户积分扣减异常, 用户ID [{}] 对应的积分商城订单编号 [{}] 用户不一致", userId, orderEntity.getUserId());
                    throw new RuntimeException("积分扣减失败, 无效的积分商城订单编号");
                }
            }
        }

        /* step-3 根据批次进行FIFO扣减 */
        List<PointsBatchDetailBO> dedPointsBatches = pointsBatchService
                .dedFIFOPointsBatches(userId, PointsEnum.USER, dto.getChangePoints(), changeType);

        /* step-4 更新用户积分余额 */
        pointsAccountService.updatePointsAccountBalance(pointsAccountId, dto.getChangePoints());

        /* step-5 异步写入积分流水记录 */
        pointsMsgSender.sendPointsFlowMsg(
                new PointsFlowBatchRecordBO(userId, PointsEnum.USER.getValue(), changeType.getValue(), dedPointsBatches)
        );

        return R.ok();
    }


    /**
     * 处理过期积分
     *
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> expiredCleanup() {
        Long userId = getCurrentUserId();
        // 查找并清除过期积分
        List<PointsBatchDetailBO> expiredPoints = pointsBatchService.clearExpiredPoints(userId, PointsEnum.USER);
        if (CollUtil.isEmpty(expiredPoints)) {
            return R.ok();
        }
        // 记录积分过期日志 & 积分变动流水
        recordExpiredPoints(expiredPoints, userId);

        return R.ok();
    }


    /**
     * 获取用户积分余额
     *
     * @return 用户积分余额
     */
    @Override
    public R<PointsBalanceVO> getBalanceDetail() {
        Long userId = getCurrentUserId();
        PointsBalanceVO vo = new PointsBalanceVO();

        // 检查当前是否存在过期积分
        List<PointsBatchDetailBO> expiredPoints = pointsBatchService.clearExpiredPoints(userId, PointsEnum.USER);
        if (expiredPoints != null) {
            recordExpiredPoints(expiredPoints, userId);
        }

        // 获取积分账户信息
        PointsAccount pointsAccount = checkPointsAccount(userId, null);
        vo.setOwnerId(userId);
        vo.setTotalPoints(pointsAccount.getAvailablePoints());
        vo.setTotalEarnedPoints(pointsAccount.getTotalEarnedPoints());

        // 获取当月所获数 & 当月消耗数
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime monthStartDay = LocalDate.now().with(TemporalAdjusters.firstDayOfMonth()).atStartOfDay();
        List<Integer> flows = pointsFlowService.getPointsChangeTotal(userId, PointsEnum.USER, monthStartDay, now);
        int earnedPoints = 0, spentPoints = 0;
        if (CollUtil.isNotEmpty(flows)) {
            for (Integer flow : flows) {
                if (flow > 0) {
                    earnedPoints += flow;
                } else {
                    spentPoints += flow;
                }
            }
        }
        vo.setMonthlyPointsEarned(earnedPoints);
        vo.setMonthlyPointsSpent(Math.abs(spentPoints));

        // 获取当月即将到期数
        Integer nearExpiryPoints = pointsBatchService.getNearExpiryTotalPoints(userId, PointsEnum.USER,
                LocalDate.now().atStartOfDay(),
                YearMonth.now().atEndOfMonth().atTime(LocalTime.MAX.truncatedTo(ChronoUnit.DAYS)));
        vo.setNearMonthlyExpiryPoints(Math.max(0, nearExpiryPoints));

        // 获取当月已过期数
        Integer monthlyExpiredPoints = pointsExpiryLogService.getExpiredPointsTotal(userId, PointsEnum.USER, monthStartDay, now);
        vo.setMonthlyExpiredPoints(Math.max(0, monthlyExpiredPoints));

        return R.ok(vo);
    }


    /**
     * private
     * 检查用户积分账户状态
     *
     * @param userId       用户ID
     * @param changePoints 积分变动数
     * @return 积分账户ID
     */
    private PointsAccount checkPointsAccount(Long userId, Integer changePoints) {
        PointsAccount pointsAccount = pointsAccountService.lambdaQuery()
                .eq(PointsAccount::getOwnerId, userId)
                .eq(PointsAccount::getOwnerType, PointsEnum.USER)
                .one();
        if (ObjUtil.isNull(pointsAccount)) {
            log.error("用户积分变动异常, 用户ID [{}] 其积分账户不存在", userId);
            throw new RuntimeException("积分变动失败, 无效的积分账户");
        }
        if (!pointsAccount.getEnable()) {
            throw new RuntimeException("用户积分变动失败, 积分账户已被冻结");
        }
        if (changePoints != null && changePoints < 0) {
            if (pointsAccount.getAvailablePoints() < Math.abs(changePoints)) {
                throw new RuntimeException("积分变动失败, 积分账户余额不足");
            }
        }

        return pointsAccount;
    }


    /**
     * private
     * 检查用户是否已签到(存在批量积分记录)
     *
     * @param currentUserId 用户ID
     * @return 积分批次实体
     */
    private PointsBatch checkInsetOrUpdateSignInPoints(Long currentUserId) {
        return pointsBatchService.getUserSignInPointsBatch(currentUserId);
    }


    /**
     * private
     * 记录积分过期记录 & 流水记录
     *
     * @param expiredPoints 过期积分批次明细列表
     * @param userId        用户ID
     */
    private void recordExpiredPoints(List<PointsBatchDetailBO> expiredPoints, Long userId) {
        // 发送异步消息记录积分过期
        pointsMsgSender.sendPointsExpiredLogMsg(new PointsExpireLogBO(userId, PointsEnum.USER.getValue(), expiredPoints));
        // 发送异步消息记录积分流水
        pointsMsgSender.sendPointsFlowMsg(new PointsFlowBatchRecordBO(
                userId, PointsEnum.USER.getValue(), PointsEnum.EXPIRED_DEDUCT.getValue(), expiredPoints)
        );
    }


    private Long getCurrentUserId() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            log.error("从安全上下文中获取不到当事人信息");
            throw new RuntimeException("无效的登录用户");
        }
        return user.getId();
    }


    /**
     * private
     * 根据积分规则-签到增加检查新增积分
     */
    private void checkAddPointBySignIn(PointsAddChangeDTO dto) {
        /* step-1 获取积分规则 */
        PointsRuleCacheDTO pointsRule;
        PointsRule pointsRuleDB = null;
        String pointsRuleId = dto.getPointsRuleId();
        if (StrUtil.isNotBlank(pointsRuleId)) {
            pointsRule = pointsRuleService.getPointsRuleCache(pointsRuleId);
            if (pointsRule == null) {
                pointsRuleDB = pointsRuleService.getById(pointsRuleId);
            }
        } else {
            pointsRule = pointsRuleService.getPrimaryPointsRuleCache(PointsRuleEnum.ADD.getValue(), dto.getChangeType());
            if (pointsRule == null) {
                pointsRuleDB = pointsRuleService.getPrimaryPointsRule(PointsRuleEnum.ADD, PointsRuleEnum.valueOf(dto.getChangeType()));
            }
        }
        if (pointsRule == null) {
            if (pointsRuleDB == null) {
                log.error("积分变动异常, 从缓存与数据库中均获取不到此无效的积分规则ID: {}", pointsRuleId);
                throw new CheckedException("无效的积分规则");
            } else {
                pointsRule = BeanUtil.copyProperties(pointsRuleDB, PointsRuleCacheDTO.class);
                if (StrUtil.isNotBlank(pointsRuleDB.getExtraRules())) {
                    pointsRule.setExtraRules(JSONUtil.toList(pointsRuleDB.getExtraRules(), String.class));
                }
            }
        }

        /* step-2 检查签到记录 */
        Integer signInCount = userCheckInLogService.checkHasSignIn(Long.valueOf(dto.getPrincipalId()));
        Assert.notNull(signInCount, () -> {
            log.error("积分变动(签到增加)异常, 用户未签到, 用户ID [{}]", dto.getPrincipalId());
            throw new CheckedException("积分增加失败, 今日未签到");
        });

        /* step-3 匹配积分规则 */
        Integer fixedPoints;
        Integer expiredDays;
        if (CollUtil.isEmpty(pointsRule.getExtraRules())) {
            // if - 匹配简单规则
            fixedPoints = pointsRule.getFixedPoints();
            expiredDays = pointsRule.getFixedExpire();
        } else {
            // else - 匹配复杂规则
            List<PointsRule.SignInRewardRule> extraRules = (List<PointsRule.SignInRewardRule>) pointsRule.getExtraRules();
            Map<Integer, PointsRule.SignInRewardRule> signInRuleMap = extraRules.stream()
                    .collect(Collectors.toMap(PointsRule.SignInRewardRule::getDays, i -> i));
            PointsRule.SignInRewardRule signInRule = signInRuleMap.get(signInCount);
            fixedPoints = signInRule.getPoints();
            expiredDays = signInRule.getExpireDays();
        }

        /* step-4 更新签到记录获取积分数 */


    }


}
package cn.joywon.poco.merchant.PointsModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.Common.util.QueryTimeValidationUtil;
import cn.joywon.poco.merchant.OrderModule.definition.OrderStatusEnum;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.entity.PointsMallOrder;
import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsExpireLogBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowBatchRecordBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowRecordBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsFlowQueryDTO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsAccount;
import cn.joywon.poco.merchant.PointsModule.entity.PointsBatch;
import cn.joywon.poco.merchant.PointsModule.entity.PointsExpiryLog;
import cn.joywon.poco.merchant.PointsModule.message.sender.PointsMsgSender;
import cn.joywon.poco.merchant.PointsModule.service.*;
import cn.joywon.poco.merchant.PointsModule.vo.PointsBalanceVO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsExpiredListVO;
import cn.joywon.poco.merchant.PointsModule.vo.PointsFlowListVO;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

@Slf4j
@Service
@RefreshScope
@RequiredArgsConstructor
public class MerchantPointsServiceImpl implements IMerchantPointsService {

    private final IPointsExpiryLogService pointsExpiryLogService;
    private final IPointsAccountService pointsAccountService;
    private final IPointsBatchService pointsBatchService;
    private final IPointsFlowService pointsFlowService;

    private final PointsMsgSender pointsMsgSender;

    private final PointsEnum MERCHANT = PointsEnum.MERCHANT;

    /**
     * 商家积分增加
     *
     * @param dto 积分增加参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> changeAdd(PointsAddChangeDTO dto) {
        Long merchantId = Long.valueOf(dto.getPrincipalId());

        /* step-1 检查商家积分账户状态 */
        Long pointsAccountId;
        try {
            pointsAccountId = checkPointsAccount(merchantId, null).getId();
        } catch (Exception e) {
            return R.failed(e.getMessage());
        }

        /* step-2 根据积分变动类型进行检查 */
        PointsEnum changeType = PointsEnum.valueOf(dto.getChangeType());
        switch (changeType) {
            // 顾客消费商家获得积分
            case ORDER_EARN -> {
                Order orderEntity = Db.getById(dto.getBizId(), Order.class);
                if (ObjUtil.isNull(orderEntity)) {
                    log.error("商家积分增加异常, 商家ID [{}] 对应编号 [{}] 的订单不存在", merchantId, dto.getBizId());
                    throw new RuntimeException("积分增加失败, 无效的订单编号");
                }
                if (!ObjUtil.equals(merchantId, orderEntity.getMerchantId())) {
                    log.error("商家积分增加异常, 商家ID [{}] 对应编号 [{}] 的订单不属于该商家", merchantId, dto.getBizId());
                    throw new RuntimeException("积分增加失败, 无效的订单编号");
                }
                if (OrderStatusEnum.valueOf(orderEntity.getStatus()) != OrderStatusEnum.COMPLETED) {
                    log.error("商家积分增加异常, 商家ID [{}] 对应编号 [{}] 的订单不在已完成状态", merchantId, dto.getBizId());
                    throw new RuntimeException("积分增加失败, 订单不在已完成状态");
                }
//                Integer earnedPoints = orderEntity.getFinalPaidPrice().multiply(BigDecimal.valueOf(pointsMultiple)).intValue();
//                if (!ObjUtil.equals(earnedPoints, dto.getChangePoints())) {
//                    log.error("商家积分增加异常, 商家ID [{}] 对应编号 [{}] 的订单金额与所获积分不一致", merchantId, dto.getBizId());
//                    throw new RuntimeException("积分增加失败, 积分变动数量有误");
//                }
            }

            // 参加活动获得积分
            case JOIN_ACTIVITY -> {
            }
        }

        /* step-3 写入/更新积分批次 */
        if (dto.getValidPeriod() != null) {
            dto.setValidEndTime(LocalDate.now().plusDays(dto.getValidPeriod()).atTime(LocalTime.MAX));
        } else if (dto.getValidEndDate() == null) {
            dto.setValidEndTime(PointsEnum.POINTS_NO_EXPIRE_DATE);
        } else {
            dto.setValidEndTime(dto.getValidEndDate().atTime(LocalTime.MAX));
        }
        PointsBatch pointsBatch = pointsBatchService.createPointsBatch(dto, merchantId, PointsEnum.MERCHANT);

        /* step-4 更新用户积分余额 */
        pointsAccountService.updatePointsAccountBalance(pointsAccountId, dto.getChangePoints());

        /* step-5 异步写入积分流水记录 */
        pointsMsgSender.sendPointsFlowMsg(
                new PointsFlowRecordBO(merchantId, MERCHANT.getValue(), pointsBatch.getId(), dto)
        );

        return R.ok();
    }


    /**
     * 商家积分扣减
     *
     * @param dto 积分扣减参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> changeDed(PointsDedChangeDTO dto) {
        Long merchantId = getCurrentMerchantId();

        /* step-1 清除过期积分(如有) */
        List<PointsBatchDetailBO> expiredPoints = pointsBatchService.clearExpiredPoints(merchantId, MERCHANT);
        if (CollUtil.isNotEmpty(expiredPoints)) {
            recordExpiredPoints(expiredPoints, merchantId);
        }

        /* step-2 检查商家积分账号状态 */
        Long pointsAccountId;
        try {
            pointsAccountId = checkPointsAccount(merchantId, dto.getChangePoints()).getId();
        } catch (Exception e) {
            return R.failed(e.getMessage());
        }

        /* step-3 根据积分变动类型进行检查 */
        PointsEnum changeType = PointsEnum.valueOf(dto.getChangeType());
        switch (changeType) {
            // 下单抵扣减少
            case ORDER_SPEND -> {
                Order orderEntity = Db.getById(dto.getBizId(), Order.class);
                if (ObjUtil.isNull(orderEntity)) {
                    log.error("商家积分扣减异常, 商家ID [{}] 对应编号 [{}] 的订单不存在", merchantId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 无效的订单编号");
                }
                if (!ObjUtil.equals(orderEntity.getUserId(), merchantId)) {
                    log.error("商家积分扣减异常, 商家ID [{}] 对应编号 [{}] 的下单ID不一致", merchantId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 无效的订单编号");
                }
                // TODO MMX 是否检验订单最终金额必须 > 0
//                Integer deductedPoints = orderEntity.getTotalProductPrice().multiply(BigDecimal.valueOf(pointsMultiple)).intValue();
//                if (!ObjUtil.equals(deductedPoints, dto.getChangePoints())) {
//                    log.error("商家积分扣减异常, 商家ID [{}] 对应编号 [{}] 的订单扣减数量不一致", merchantId, dto.getBizId());
//                    throw new RuntimeException("积分扣减失败, 订单扣减积分数量不一致");
//                }
            }
            // 商城兑换减少
            case MALL_REDEEM -> {
                PointsMallOrder orderEntity = Db.getById(dto.getBizId(), PointsMallOrder.class);
                if (ObjUtil.isNull(orderEntity)) {
                    log.error("商家积分扣减异常, 商家ID [{}] 对应编号 [{}] 的积分商城订单不存在", merchantId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 无效的订单编号");
                }
                if (!ObjUtil.equals(orderEntity.getUserId(), merchantId)) {
                    log.error("商家积分扣减异常, 商家ID [{}] 对应编号 [{}] 的积分商城订单下单ID不一致", merchantId, dto.getBizId());
                    throw new RuntimeException("积分扣减失败, 无效的订单编号");
                }
            }
        }

        /* step-4 根据批次进行FIFO扣减 */
        List<PointsBatchDetailBO> dedPointsBatches = pointsBatchService
                .dedFIFOPointsBatches(merchantId, MERCHANT, dto.getChangePoints(), changeType);

        /* step-5 更新商家积分余额 */
        pointsAccountService.updatePointsAccountBalance(pointsAccountId, dto.getChangePoints());

        /* step-6 异步写入积分流水 */
        pointsMsgSender.sendPointsFlowMsg(
                new PointsFlowBatchRecordBO(merchantId, MERCHANT.getValue(), changeType.getValue(), dedPointsBatches)
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
        Long merchantId = getCurrentMerchantId();
        // 查找并清除过期积分
        List<PointsBatchDetailBO> expiredPoints = pointsBatchService.clearExpiredPoints(merchantId, MERCHANT);
        if (!CollUtil.isNotEmpty(expiredPoints)) {
            return R.ok();
        }
        // 记录积分过期日志 & 积分变动流水
        recordExpiredPoints(expiredPoints, merchantId);

        return R.ok();
    }


    /**
     * 获取商家积分余额
     *
     * @return 查询结果
     */
    @Override
    public R<Integer> getBalance() {
        Integer points = checkPointsAccount(getCurrentMerchantId(), null).getAvailablePoints();
        return R.ok(points);
    }


    /**
     * 获取商家积分详情
     *
     * @return 响应结果
     */
    @Override
    public R<PointsBalanceVO> getBalanceDetail() {
        Long merchantId = getCurrentMerchantId();
        PointsBalanceVO vo = new PointsBalanceVO();

        // 检查当前是否存在过期积分
        List<PointsBatchDetailBO> expiredPoints = pointsBatchService.clearExpiredPoints(merchantId, MERCHANT);
        if (expiredPoints != null) {
            recordExpiredPoints(expiredPoints, merchantId);
        }

        // 获取积分账户信息
        PointsAccount pointsAccount = checkPointsAccount(merchantId, null);
        vo.setTotalEarnedPoints(pointsAccount.getTotalEarnedPoints());
        vo.setTotalPoints(pointsAccount.getAvailablePoints());
        vo.setOwnerId(merchantId);

        // 获取当月积分消耗数 & 所获数
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime monthStartDay = LocalDate.now().with(TemporalAdjusters.firstDayOfMonth()).atStartOfDay();
        List<Integer> flows = pointsFlowService.getPointsChangeTotal(merchantId, MERCHANT, monthStartDay, now);
        int spentPoints = 0, earnedPoints = 0;
        if (CollUtil.isNotEmpty(flows)) {
            for (Integer flow : flows) {
                if (flow < 0) {
                    spentPoints += flow;
                } else {
                    earnedPoints += flow;
                }
            }
        }
        vo.setMonthlyPointsSpent(Math.abs(spentPoints));
        vo.setMonthlyPointsEarned(earnedPoints);

        // 获取当月即将到期数
        Integer nearExpiryPoints = pointsBatchService.getNearExpiryTotalPoints(merchantId, MERCHANT,
                LocalDate.now().atStartOfDay(),
                YearMonth.now().atEndOfMonth().atTime(LocalTime.MAX.truncatedTo(ChronoUnit.DAYS)));
        vo.setNearMonthlyExpiryPoints(Math.max(0, nearExpiryPoints));

        // 获取当月已过期数
        Integer monthlyExpiredPoints = pointsExpiryLogService.getExpiredPointsTotal(merchantId, MERCHANT, monthStartDay, now);
        vo.setMonthlyExpiredPoints(Math.max(0, monthlyExpiredPoints));

        return R.ok(vo);
    }


    /**
     * 查询商家积分变动记录
     *
     * @param dto 积分变动记录查询参数
     * @return 查询结果
     */
    @Override
    public R<PageQueryVO<PointsFlowListVO>> queryPointsFlow(PointsFlowQueryDTO dto) {
        QueryTimeValidationUtil.QueryTime queryTime = QueryTimeValidationUtil.datesValidation(
                dto.getStartDate(), dto.getEndDate(), QueryTimeValidationUtil.DaySpanEnum.THREE_MONTH, 3, null
        );
        dto.setStartTime(queryTime.startTime());
        dto.setEndTime(queryTime.endTime());
        PageQueryVO<PointsFlowListVO> pageData = pointsFlowService.queryPointsFlow(dto, getCurrentMerchantId(), MERCHANT);

        return R.ok(pageData);
    }


    /**
     * 获取商家积分过期记录
     *
     * @return 查询结果
     */
    @Override
    public R<List<PointsExpiredListVO>> getPointsExpiredLog() {
        List<PointsExpiryLog> expiredLogs = pointsExpiryLogService.lambdaQuery()
                .eq(PointsExpiryLog::getOwnerId, getCurrentMerchantId())
                .eq(PointsExpiryLog::getOwnerType, MERCHANT)
                .orderByDesc(PointsExpiryLog::getCreatedTime)
                .last("LIMIT 100")
                .list();

        if (CollUtil.isEmpty(expiredLogs)) {
            return R.ok(List.of());
        }
        List<PointsExpiredListVO> vos = BeanUtil.copyToList(expiredLogs, PointsExpiredListVO.class);

        return R.ok(vos);
    }


    /**
     * private
     * 检查商家积分账户状态
     *
     * @param merchantId   商家ID
     * @param changePoints 积分变动数量
     * @return 商家积分账户
     */
    private PointsAccount checkPointsAccount(Long merchantId, Integer changePoints) {
        PointsAccount pointsAccount = pointsAccountService.lambdaQuery()
                .eq(PointsAccount::getOwnerId, merchantId)
                .eq(PointsAccount::getOwnerType, MERCHANT)
                .one();
        Assert.notNull(pointsAccount, () -> {
            throw new CheckedException("商家积分账户不存在");
        });
        Assert.isTrue(pointsAccount.getEnable(), () -> {
            throw new CheckedException("商家积分账户已被冻结");
        });
        if (changePoints != null && changePoints < 0) {
            Assert.isTrue(pointsAccount.getAvailablePoints() >= Math.abs(changePoints), () -> {
                throw new CheckedException("商家积分账户可用余额不足");
            });
        }

        return pointsAccount;
    }


    /**
     * private
     * 记录积分过期记录 & 流水记录
     *
     * @param expiredPoints 过期积分批次明细列表
     * @param merchantId    商家ID
     */
    private void recordExpiredPoints(List<PointsBatchDetailBO> expiredPoints, Long merchantId) {
        // 发送异步消息记录积分过期
        pointsMsgSender.sendPointsExpiredLogMsg(new PointsExpireLogBO(merchantId, MERCHANT.getValue(), expiredPoints));
        // 发送异步消息记录积分流水
        pointsMsgSender.sendPointsFlowMsg(new PointsFlowBatchRecordBO(
                merchantId, MERCHANT.getValue(), PointsEnum.EXPIRED_DEDUCT.getValue(), expiredPoints)
        );
    }


    private Long getCurrentMerchantId() {
        PocoUser user = SecurityUtils.getUser();
        if (ObjUtil.isNull(user)) {
            throw new RuntimeException("无效的登录用户");
        }
        return user.getDeptId();
    }


}
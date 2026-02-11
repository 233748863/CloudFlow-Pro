package cn.joywon.poco.merchant.PointsModule.service.impl;

import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.joywon.poco.merchant.Common.util.RLockUtil;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.entity.PointsAccount;
import cn.joywon.poco.merchant.PointsModule.mapper.PointsAccountMapper;
import cn.joywon.poco.merchant.PointsModule.service.IPointsAccountService;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static cn.joywon.poco.merchant.PointsModule.definition.PointsKeyConst.LOCK_KEY_PREFIX_POINTS_ACCOUNT;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointsAccountServiceImpl extends
        ServiceImpl<PointsAccountMapper, PointsAccount> implements IPointsAccountService {

    private final RLockUtil lockUtil;

    private final PointsAccountMapper pointsAccountMapper;


    /**
     * 创建积分账户
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     */
    @Override
    public Long createPointsAccount(Long ownerId, PointsEnum ownerType) {
        PointsAccount entity = new PointsAccount();
        entity.setOwnerId(ownerId);
        entity.setOwnerType(ownerType);
        boolean result = save(entity);
        Assert.isTrue(result, () -> {
            log.error("[{}]ID [{}] 积分账户创建失败", ownerType.getValue(), ownerId);
            throw new RuntimeException("积分账户创建失败");
        });

        return entity.getId();
    }


    /**
     * 删除积分账户
     *
     * @param ids 积分账户ID
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePointsAccounts(List<Long> ids) {
        int count = pointsAccountMapper.deletePointsAccounts(ids);
        Assert.isTrue(count == ids.size(), () -> {
            log.error("积分账户 [{}] 删除失败", ids);
            throw new RuntimeException("积分账户删除失败");
        });
    }


    /**
     * 更新积分账户余额
     *
     * @param pointsAccountId 积分账户ID
     * @param changePoints    积分变动数
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updatePointsAccountBalance(Long pointsAccountId, Integer changePoints) {
        RLock lock = lockUtil.tryLock(LOCK_KEY_PREFIX_POINTS_ACCOUNT + pointsAccountId);
        boolean result;
        if (lock == null) {
            throw new RuntimeException("积分账户变动失败");
        }
        try {
            PointsAccount pointsAccount = getById(pointsAccountId);
            checkPointsAccount(pointsAccount);
            renewPointsAccount(pointsAccount, changePoints);
            result = updateById(pointsAccount);
            checkResult(result, pointsAccountId);

        } catch (Exception e) {
            log.error("积分账户 [{}] 积分变动出现异常", pointsAccountId, e);
            throw new RuntimeException("积分账户变动失败");

        } finally {
            lockUtil.releaseLock(lock);
        }

    }


    /**
     * 更新积分账户余额
     *
     * @param ownerId      用户/商家ID
     * @param ownerType    积分账户类型
     * @param changePoints 积分变动数
     */
    @Override
    public void updatePointsAccountBalance(Long ownerId, PointsEnum ownerType, Integer changePoints) {
        PointsAccount pointsAccount = lambdaQuery()
                .eq(PointsAccount::getOwnerType, ownerType)
                .eq(PointsAccount::getOwnerId, ownerId)
                .one();
        checkPointsAccount(pointsAccount);

        RLock lock = lockUtil.tryLock(LOCK_KEY_PREFIX_POINTS_ACCOUNT + pointsAccount.getId());
        boolean result;
        if (lock == null) {
            throw new RuntimeException("积分增加失败, 请稍后重试");
        }
        try {
            renewPointsAccount(pointsAccount, changePoints);
            result = updateById(pointsAccount);
            checkResult(result, pointsAccount.getId());

        } catch (Exception e) {
            log.error("积分账户 [{}] 积分变动出现异常", pointsAccount.getId(), e);
            throw new RuntimeException("积分账户 [" + pointsAccount.getId() + "] 变动失败");
        } finally {
            lockUtil.releaseLock(lock);
        }

    }


    /**
     * private
     * 检查积分账户状态
     *
     * @param pointsAccount 积分账户
     */
    private void checkPointsAccount(PointsAccount pointsAccount) {
        if (ObjUtil.isNull(pointsAccount)) {
            throw new RuntimeException("积分账户不存在");
        }
        if (!pointsAccount.getEnable()) {
            throw new RuntimeException("积分账户已被冻结");
        }
    }


    /**
     * private
     * 更新积分账户余额
     *
     * @param pointsAccount 积分账户
     * @param changePoints  积分变动数
     */
    private void renewPointsAccount(PointsAccount pointsAccount, Integer changePoints) {
        LocalDateTime now = LocalDateTime.now();
        if (changePoints > 0) {
            pointsAccount.setTotalEarnedPoints(pointsAccount.getTotalEarnedPoints() + changePoints);
            pointsAccount.setAvailablePoints(pointsAccount.getAvailablePoints() + changePoints);
            pointsAccount.setLastGainTime(now);
        } else {
            int calculatePoints = pointsAccount.getAvailablePoints() + changePoints;
            if (calculatePoints < 0) {
                throw new RuntimeException("积分扣减失败, 积分账户余额不足支持本次变动");
            }
            pointsAccount.setAvailablePoints(calculatePoints);
            pointsAccount.setLastDeductTime(now);
        }
    }


    private void checkResult(boolean result, Long pointsAccountId) {
        if (!result) {
            log.error("积分账户 [{}] 积分变动失败", pointsAccountId);
            throw new RuntimeException("积分账户变动失败");
        }
    }


}
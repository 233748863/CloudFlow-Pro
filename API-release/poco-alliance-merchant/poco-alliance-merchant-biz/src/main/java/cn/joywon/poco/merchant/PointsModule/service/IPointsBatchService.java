package cn.joywon.poco.merchant.PointsModule.service;

import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsBatch;
import com.baomidou.mybatisplus.extension.service.IService;

import java.time.LocalDateTime;
import java.util.List;

public interface IPointsBatchService extends IService<PointsBatch> {


    /**
     * 创建积分批次
     *
     * @param dto       积分新增参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 操作结果(积分批次实体)
     */
    PointsBatch createPointsBatch(PointsAddChangeDTO dto, Long ownerId, PointsEnum ownerType);

    /**
     * 更新积分批次
     *
     * @param pointsBatch 积分批次实体
     * @return 操作结果
     */
    boolean updatePointsBatch(PointsBatch pointsBatch);


    /**
     * 刷新签到奖励积分批次
     *
     * @param dto             签到积分参数
     * @param pointsBatch     积分批次实体
     * @param pointsAccountId 积分账户ID
     * @return 积分批次实体
     */
    PointsBatch renewSignInPointsBatch(PointsAddChangeDTO dto, PointsBatch pointsBatch, Long pointsAccountId);


    /**
     * 清除过期积分批次
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     */
    List<PointsBatchDetailBO> clearExpiredPoints(Long ownerId, PointsEnum ownerType);


    /**
     * 根据FIFO扣减可用积分批次
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param dedPoints 积分消耗数
     * @return 已消耗积分批次明细列表
     */
    List<PointsBatchDetailBO> dedFIFOPointsBatches(Long ownerId, PointsEnum ownerType, int dedPoints, PointsEnum changeType);


    /**
     * 获取指定时间范围内到期的积分数量
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 即将到期积分数
     */
    Integer getNearExpiryTotalPoints(Long ownerId, PointsEnum ownerType, LocalDateTime startTime, LocalDateTime endTime);


    /**
     * 获取用户签到奖励积分批次
     *
     * @param ownerId 用户ID
     * @return 积分批次实体
     */
    PointsBatch getUserSignInPointsBatch(Long ownerId);


    /**
     * 获取商家日积分批次
     *
     * @param merchantId 商家ID
     * @return 积分批次实体
     */
    PointsBatch getMerchantDailyPointsBatch(Long merchantId);


    /**
     * 初始化签到奖励积分批次
     *
     * @param dto       签到积分参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 积分批次实体
     */
    PointsBatch initSignInPointsBatch(PointsAddChangeDTO dto, Long ownerId, PointsEnum ownerType);


}
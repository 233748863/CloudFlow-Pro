package cn.joywon.poco.merchant.PointsModule.service;

import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.entity.PointsExpiryLog;
import com.baomidou.mybatisplus.extension.service.IService;

import java.time.LocalDateTime;
import java.util.List;

public interface IPointsExpiryLogService extends IService<PointsExpiryLog> {


    /**
     * 保存积分过期记录
     *
     * @param ownerId      用户/商家ID
     * @param expiryPoints 过期积分数量
     * @return 操作结果
     */
    boolean saveRecord(Long ownerId, Integer expiryPoints);


    /**
     * 记录过期签到积分
     *
     * @param expiredPoints 过期积分记录列表
     * @param ownerId       用户/商家ID
     * @param ownerType     用户/商家类型
     */
    void recordExpiredPoints(List<PointsBatchDetailBO> expiredPoints, Long ownerId, PointsEnum ownerType);


    /**
     * 获取指定时间范围内过期的积分数量
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 过期积分数
     */
    Integer getExpiredPointsTotal(Long ownerId, PointsEnum ownerType, LocalDateTime startTime, LocalDateTime endTime);


}
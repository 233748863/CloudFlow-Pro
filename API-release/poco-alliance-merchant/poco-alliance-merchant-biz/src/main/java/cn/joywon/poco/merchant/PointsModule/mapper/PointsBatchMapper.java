package cn.joywon.poco.merchant.PointsModule.mapper;

import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchBO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsBatch;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PointsBatchMapper extends BaseMapper<PointsBatch> {


    /**
     * 查找过期的积分批次
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 过期的积分批次列表
     */
    List<PointsBatchBO> selectExpiredBatchesForUpdate(@Param("ownerId") Long ownerId,
                                                      @Param("ownerType") String ownerType);


    /**
     * 查询FIFO可用积分批次
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param dedPoints 积分消耗数
     * @return 积分批次列表
     */
    List<PointsBatchBO> selectFIFOBatches(@Param("ownerId") Long ownerId,
                                          @Param("ownerType") String ownerType,
                                          @Param("dedPoints") int dedPoints);


    /**
     * 获取指定时间范围内到期的积分数量
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 即将到期积分数
     */
    Integer getNearExpiryTotalPoints(@Param("ownerId") Long ownerId, @Param("ownerType") String ownerType,
                                     @Param("startTime") LocalDateTime startTime, @Param("endTime") LocalDateTime endTime);


}
package cn.joywon.poco.merchant.PointsModule.mapper;

import cn.joywon.poco.merchant.PointsModule.entity.PointsExpiryLog;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface PointExpiryLogMapper extends BaseMapper<PointsExpiryLog> {


    /**
     * 获取指定时间范围内过期的积分数量
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 用户/商家类型
     * @param startTime 开始时间
     * @param endTime   结束时间
     * @return 过期积分总数
     */
    Integer getExpiredPointsTotal(@Param("ownerId") Long ownerId, @Param("ownerType") String ownerType,
                                  @Param("startTime") LocalDateTime startTime, @Param("endTime") LocalDateTime endTime);


}
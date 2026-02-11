package cn.joywon.poco.merchant.PointsModule.mapper;

import cn.joywon.poco.merchant.PointsModule.dto.PointsFlowQueryDTO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsFlow;
import cn.joywon.poco.merchant.PointsModule.vo.PointsFlowListVO;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PointsFlowMapper extends BaseMapper<PointsFlow> {


    /**
     * 获取指定时间范围内积分变动数量列表
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 积分变动数量列表
     */
    List<Integer> getPointsChangeTotal(@Param("ownerId") Long ownerId, @Param("ownerType") String ownerType,
                                       @Param("startTime") LocalDateTime startTime,
                                       @Param("endTime") LocalDateTime endTime);


    /**
     * 查询积分流水记录列表
     *
     * @param page      分页参数
     * @param dto       查询参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 积分流水记录分页列表
     */
    Page<PointsFlowListVO> queryPointsFlow(@Param("page") Page<Object> page, @Param("dto") PointsFlowQueryDTO dto,
                                           @Param("ownerId") Long ownerId, @Param("ownerType") String ownerType);


}
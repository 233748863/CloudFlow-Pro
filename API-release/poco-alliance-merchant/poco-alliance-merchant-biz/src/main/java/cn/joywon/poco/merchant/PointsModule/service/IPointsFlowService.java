package cn.joywon.poco.merchant.PointsModule.service;

import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowBatchRecordBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowRecordBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsFlowQueryDTO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsFlow;
import cn.joywon.poco.merchant.PointsModule.vo.PointsFlowListVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.time.LocalDateTime;
import java.util.List;

public interface IPointsFlowService extends IService<PointsFlow> {


    /**
     * 新增积分变动记录
     *
     * @param bo 积分变动记录参数
     * @return 操作结果
     */
    boolean saveRecord(PointsFlowRecordBO bo);


    /**
     * 记录过期积分流水记录
     *
     * @param bo 积分变动记录参数
     */
    void recordPointsFlows(PointsFlowBatchRecordBO bo);


    /**
     * 初始化过期积分实体
     *
     * @param entities 过期积分实体列表
     * @return 初始化结果
     */
    List<PointsFlow> initExpiredEntities(List<PointsFlow> entities);


    /**
     * 获取指定时间范围内积分变动数量列表
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 查询结果(积分变动数量列表)
     */
    List<Integer> getPointsChangeTotal(Long ownerId, PointsEnum ownerType, LocalDateTime startTime, LocalDateTime endTime);


    /**
     * 查询积分变动流水记录列表
     *
     * @param dto       查询参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 查询结果(积分流水记录分页列表)
     */
    PageQueryVO<PointsFlowListVO> queryPointsFlow(PointsFlowQueryDTO dto, Long ownerId, PointsEnum ownerType);


}
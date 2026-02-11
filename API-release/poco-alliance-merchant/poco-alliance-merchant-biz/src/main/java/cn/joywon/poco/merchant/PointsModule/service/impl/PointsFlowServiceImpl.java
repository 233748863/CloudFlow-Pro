package cn.joywon.poco.merchant.PointsModule.service.impl;

import cn.hutool.core.util.ObjUtil;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowBatchRecordBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsFlowRecordBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsDedChangeDTO;
import cn.joywon.poco.merchant.PointsModule.dto.PointsFlowQueryDTO;
import cn.joywon.poco.merchant.PointsModule.entity.PointsFlow;
import cn.joywon.poco.merchant.PointsModule.mapper.PointsFlowMapper;
import cn.joywon.poco.merchant.PointsModule.service.IPointsFlowService;
import cn.joywon.poco.merchant.PointsModule.vo.PointsFlowListVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointsFlowServiceImpl extends ServiceImpl<PointsFlowMapper, PointsFlow> implements IPointsFlowService {

    private final PointsFlowMapper pointsFlowMapper;

    /**
     * 新增积分变动记录
     *
     * @param bo 积分变动记录参数
     * @return 操作结果
     */
    @Override
    public boolean saveRecord(PointsFlowRecordBO bo) {
        PointsFlow entity = initPointTransactionEntity(bo);
        if (ObjUtil.isNull(entity)) {
            return false;
        }

        return save(entity);
    }


    /**
     * 记录过期积分流水记录
     *
     * @param bo 积分变动记录参数
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordPointsFlows(PointsFlowBatchRecordBO bo) {
        Long ownerId = bo.getOwnerId();
        PointsEnum ownerType = PointsEnum.valueOf(bo.getOwnerType());
        PointsEnum changeType = PointsEnum.valueOf(bo.getChangeType());
        List<PointsBatchDetailBO> batchDetails = bo.getPointsBatches();

        List<PointsFlow> entities = new ArrayList<>();
        for (PointsBatchDetailBO detail : batchDetails) {
            PointsFlow entity = new PointsFlow();
            entity.setOwnerId(ownerId);
            entity.setOwnerType(ownerType);
            entity.setChangeType(changeType);
            entity.setBizId(detail.getBiz_id());
            entity.setBatchId(detail.getBatchId());
            entity.setBatchGainDate(detail.getDate());
            entity.setChangePoints(Math.negateExact(detail.getPoints()));

            entities.add(entity);
        }

        boolean result = saveBatch(entities);
        if (!result) {
            log.error("记录过期积分流水记录失败, ownerId: [{}], ownerType: [{}], changeType: [{}], batchDetails: [{}]",
                    ownerId, ownerType, changeType, batchDetails);
            throw new RuntimeException("记录积分变动流水记录失败");
        }

    }


    /**
     * 初始化过期积分实体列表
     *
     * @param entities 过期积分实体列表
     * @return 初始化结果
     */
    @Override
    public List<PointsFlow> initExpiredEntities(List<PointsFlow> entities) {
        Long ownerId = entities.get(0).getOwnerId();
        PointsEnum ownerType = entities.get(0).getOwnerType();
        List<PointsFlow> expiredEntities = new ArrayList<>();
        for (PointsFlow entity : entities) {
            PointsFlow expiredEntity = initExpiredEntity(entity, ownerType, ownerId);
            expiredEntities.add(expiredEntity);
        }

        return expiredEntities;
    }


    /**
     * 获取指定时间范围内积分变动数量列表
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 积分变动数量列表
     */
    @Override
    public List<Integer> getPointsChangeTotal(Long ownerId, PointsEnum ownerType, LocalDateTime startTime, LocalDateTime endTime) {
        return pointsFlowMapper.getPointsChangeTotal(ownerId, ownerType.getValue(), startTime, endTime);
    }


    /**
     * 查询积分变动流水记录列表
     *
     * @param dto       查询参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 查询结果(积分流水记录分页列表)
     */
    @Override
    public PageQueryVO<PointsFlowListVO> queryPointsFlow(PointsFlowQueryDTO dto, Long ownerId, PointsEnum ownerType) {
        Page<PointsFlowListVO> pageData = pointsFlowMapper.queryPointsFlow(dto.page(), dto, ownerId, ownerType.getValue());

        return PageQueryVO.of(pageData);
    }


    /**
     * private
     * 初始化过期积分实体
     *
     * @param entity    过期积分实体
     * @param ownerType 积分变动对象类型
     * @param ownerId   积分变动对象ID
     * @return 过期积分实体
     */
    private PointsFlow initExpiredEntity(PointsFlow entity, PointsEnum ownerType, Long ownerId) {
        PointsFlow expiredEntity = new PointsFlow();
        expiredEntity.setChangePoints(Math.negateExact(entity.getChangePoints()));
        expiredEntity.setChangeType(PointsEnum.EXPIRED_DEDUCT);
        expiredEntity.setBizId(entity.getId());
        expiredEntity.setOwnerType(ownerType);
        expiredEntity.setOwnerId(ownerId);

        return expiredEntity;
    }


    /**
     * private
     * 初始化积分变动实体
     *
     * @param bo 积分变动记录参数
     * @return 积分变动实体
     */
    private PointsFlow initPointTransactionEntity(PointsFlowRecordBO bo) {
        Long ownerId = bo.getOwnerId();
        Object dto = bo.getPointsChangeDTO();
        Long pointsBatchId = bo.getPointsBatchId();
        PointsEnum ownerType = PointsEnum.valueOf(bo.getOwnerType());

        PointsFlow entity = new PointsFlow();
        if (dto instanceof PointsDedChangeDTO dedDTO) {
            entity.setOwnerId(ownerId);
            entity.setOwnerType(ownerType);
            entity.setBatchId(pointsBatchId);
            entity.setBizId(Long.valueOf(dedDTO.getBizId()));
            entity.setChangePoints(dedDTO.getChangePoints());
            entity.setChangeType(PointsEnum.valueOf(dedDTO.getChangeType()));

        } else if (dto instanceof PointsAddChangeDTO addDTO) {
            entity.setChangeType(PointsEnum.valueOf(addDTO.getChangeType()));
            entity.setChangePoints(addDTO.getChangePoints());
            entity.setBizId(Long.valueOf(addDTO.getBizId()));
            entity.setBatchId(pointsBatchId);
            entity.setOwnerType(ownerType);
            entity.setOwnerId(ownerId);
        }

        return entity;
    }


}
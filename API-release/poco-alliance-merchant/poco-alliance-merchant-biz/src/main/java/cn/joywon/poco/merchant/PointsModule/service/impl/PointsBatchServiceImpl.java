package cn.joywon.poco.merchant.PointsModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.Common.util.DateInitUtil;
import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchBO;
import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.definition.PointsKeyConst;
import cn.joywon.poco.merchant.PointsModule.dto.PointsAddChangeDTO;
import cn.joywon.poco.merchant.PointsModule.entity.BatchDetail;
import cn.joywon.poco.merchant.PointsModule.entity.PointsBatch;
import cn.joywon.poco.merchant.PointsModule.mapper.PointsBatchMapper;
import cn.joywon.poco.merchant.PointsModule.service.IPointsAccountService;
import cn.joywon.poco.merchant.PointsModule.service.IPointsBatchService;
import com.baomidou.lock.annotation.Lock4j;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointsBatchServiceImpl extends
        ServiceImpl<PointsBatchMapper, PointsBatch> implements IPointsBatchService {

    private final IPointsAccountService pointsAccountService;

    private final PointsBatchMapper pointsBatchMapper;


    /**
     * 创建积分批次
     *
     * @param dto       积分新增参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 操作结果
     */
    @Override
    public PointsBatch createPointsBatch(PointsAddChangeDTO dto, Long ownerId, PointsEnum ownerType) {
        Integer points = dto.getChangePoints();

        BatchDetail batchDetail = new BatchDetail();
        batchDetail.setPoints(points);
        batchDetail.setRemaining(points);
        batchDetail.setDate(LocalDate.now());
        batchDetail.setExpire_date(dto.getValidEndTime());
        batchDetail.setBiz_id(Long.valueOf(dto.getBizId()));
        String batchDetailJson = JSONUtil.toJsonStr(List.of(batchDetail));

        PointsBatch entity = new PointsBatch();
        entity.setUsedPoints(0);
        entity.setOwnerId(ownerId);
        entity.setBatchPoints(points);
        entity.setOwnerType(ownerType);
        entity.setRemainingPoints(points);
        entity.setBatchDetail(batchDetailJson);
        entity.setFirstExpireDate(dto.getValidEndTime());
        entity.setSourceType(PointsEnum.valueOf(dto.getChangeType()));

        boolean result = save(entity);
        Assert.isTrue(result, () -> {
            log.error("创建 [{}]ID [{}] 积分批次失败, 变动积分: {}", ownerType.getValue(), ownerId, dto);
            throw new RuntimeException("创建积分批次失败");
        });

        return entity;
    }


    /**
     * 更新积分批次
     *
     * @param pointsBatch 积分批次实体
     * @return 操作结果
     */
    @Override
    @Lock4j(name = PointsKeyConst.LOCK_KEY_PREFIX_POINTS_BATCH,
            keys = "#pointsBatch.ownerType.getValue() + ':' + #ownerId")
    public boolean updatePointsBatch(PointsBatch pointsBatch) {
        return updateById(pointsBatch);
    }


    /**
     * 刷新签到奖励积分批次
     *
     * @param dto             签到积分参数
     * @param pointsBatch     积分批次实体
     * @param pointsAccountId 积分账户ID
     * @return 积分批次实体
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public PointsBatch renewSignInPointsBatch(PointsAddChangeDTO dto, PointsBatch pointsBatch, Long pointsAccountId) {
        LocalDate now = LocalDate.now();
        // 取出批次记录中的明细记录
        List<BatchDetail> batchDetails = JSONUtil.toList(pointsBatch.getBatchDetail(), BatchDetail.class);
        // 批次记录中插入本次明细
        BatchDetail batchDetail = new BatchDetail();
        batchDetail.setDate(now);
        batchDetail.setPoints(dto.getChangePoints());
        batchDetail.setRemaining(dto.getChangePoints());
        batchDetail.setExpire_date(dto.getValidEndTime());
        batchDetail.setBiz_id(Long.valueOf(dto.getBizId()));
        batchDetails.add(batchDetail);
        // 更新批次记录批次明细 & 积分总量 & 过期时间 & 可用数量
        pointsBatch.setBatchDetail(JSONUtil.toJsonStr(batchDetails));
        pointsBatch.setBatchPoints(pointsBatch.getBatchPoints() + dto.getChangePoints());
        pointsBatch.setRemainingPoints(pointsBatch.getRemainingPoints() + dto.getChangePoints());

        return pointsBatch;
    }


    /**
     * 清除过期积分批次
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     */
    @Override
    @SysLog(value = "积分过期处理")
    @Transactional(rollbackFor = Exception.class)
    @Lock4j(name = PointsKeyConst.LOCK_KEY_PREFIX_POINTS_BATCH, keys = "#ownerType.getValue() + ':' + #ownerId")
    public List<PointsBatchDetailBO> clearExpiredPoints(Long ownerId, PointsEnum ownerType) {
        /* step-1 查询过期积分批次 */
        String ownerTyp = ownerType.getValue();
        List<PointsBatchBO> expiredBatches = pointsBatchMapper.selectExpiredBatchesForUpdate(ownerId, ownerTyp);
        if (CollUtil.isEmpty(expiredBatches)) {
            return null;
        }

        /* step-2 处理过期积分批次 */
        List<PointsBatch> updatePointsBatches = new ArrayList<>();
        List<PointsBatchDetailBO> expiredPointsList = new ArrayList<>();
        int totalExpiredBatchPoints = 0;
        // 处理积分批次
        for (PointsBatchBO bo : expiredBatches) {
            LocalDateTime today = LocalDate.now().atTime(23, 59, 59);
            int newFirstExpireIndex = 0;
            int totalExpiredPoints = 0;
            List<BatchDetail> batchDetails = JSONUtil.toList(bo.getBatchDetail(), BatchDetail.class);
            // 检查批次明细中过期的积分
            for (int i = 0; i < batchDetails.size(); i++) {
                BatchDetail bd = batchDetails.get(i);
                if (bd.getExpire_date().isBefore(today) && bd.getRemaining() > 0) {
                    totalExpiredBatchPoints += bd.getPoints();
                    totalExpiredPoints += bd.getPoints();
                    newFirstExpireIndex = i;
                    bd.setRemaining(0);
                    // 记录过期流水记录
                    PointsBatchDetailBO expiredPoints = BeanUtil.copyProperties(bd, PointsBatchDetailBO.class);
                    expiredPoints.setBatchId(bo.getBatchId());
                    expiredPointsList.add(expiredPoints);
                }
            }
            // 修改批次记录实体
            PointsBatch updatePointsBatch = new PointsBatch();
            updatePointsBatch.setId(bo.getBatchId());
            updatePointsBatch.setBatchDetail(JSONUtil.toJsonStr(batchDetails));
            updatePointsBatch.setRemainingPoints(bo.getRemainingPoints() - totalExpiredPoints);
            updatePointsBatch.setFirstExpireDate(batchDetails.get(newFirstExpireIndex + 1) != null ?
                    batchDetails.get(newFirstExpireIndex + 1).getExpire_date() : batchDetails.get(newFirstExpireIndex).getExpire_date());
            updatePointsBatches.add(updatePointsBatch);
        }

        /* step-3 更新积分批次记录 */
        boolean result = updateBatchById(updatePointsBatches);
        Assert.isTrue(result, () -> {
            log.error("更新 [{}] ID [{}] 积分批次过期积分出现错误, 过期积分批次: {}", ownerTyp, ownerId, expiredBatches);
            throw new RuntimeException("更新积分批次过期积分失败, 请重试");
        });

        /* step-3 更新积分账户余额 */
        pointsAccountService.updatePointsAccountBalance(ownerId, ownerType, Math.negateExact(totalExpiredBatchPoints));

        return expiredPointsList;
    }


    /**
     * 根据FIFO扣除可用积分批次
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param dedPoints 积分消耗数
     * @return 已消耗积分批次明细列表
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    @Lock4j(name = PointsKeyConst.LOCK_KEY_PREFIX_POINTS_BATCH, keys = "#ownerType.getValue() + ':' + #ownerId")
    public List<PointsBatchDetailBO> dedFIFOPointsBatches(Long ownerId, PointsEnum ownerType, int dedPoints, PointsEnum changeType) {
        if (0 > dedPoints) {
            throw new IllegalArgumentException("无效的积分扣除数量");
        }
        int negDedPoints = Math.negateExact(dedPoints);
        String ownerTyp = ownerType.getValue();

        /* step-1 查询FIFO可用积分批次 */
        List<PointsBatchBO> pointsFIFOBatches = pointsBatchMapper.selectFIFOBatches(ownerId, ownerTyp, negDedPoints);
        if (CollUtil.isEmpty(pointsFIFOBatches)) {
            throw new RuntimeException("当前无可用积分");
        }

        /* step-2 拆分足额扣减批次 & 最后不足额批次 */
        List<PointsBatchBO> fullDeductBatches = new ArrayList<>();
        PointsBatchBO lastBatch = null;
        for (PointsBatchBO bo : pointsFIFOBatches) {
            if (negDedPoints >= bo.getRemainingPoints()) {
                negDedPoints -= bo.getRemainingPoints();
                fullDeductBatches.add(bo);
            } else {
                lastBatch = bo;
                break;
            }
        }

        /* step-3 修改积分批次 */
        List<PointsBatchDetailBO> spentPointsList = new ArrayList<>();
        List<PointsBatch> updatePointsBatches = new ArrayList<>();
        // 修改足额扣除积分批次
        if (CollUtil.isNotEmpty(fullDeductBatches)) {
            for (PointsBatchBO bo : fullDeductBatches) {
                List<BatchDetail> batchDetails = JSONUtil.toList(bo.getBatchDetail(), BatchDetail.class);
                for (BatchDetail bd : batchDetails) {
                    bd.setRemaining(0);
                    //  记录积分流水记录
                    PointsBatchDetailBO expiredPoints = BeanUtil.copyProperties(bd, PointsBatchDetailBO.class);
                    expiredPoints.setBatchId(bo.getBatchId());
                    spentPointsList.add(expiredPoints);
                }
                PointsBatch updatePointsBatch = new PointsBatch();
                updatePointsBatch.setRemainingPoints(0);
                updatePointsBatch.setId(bo.getBatchId());
                updatePointsBatch.setBatchDetail(JSONUtil.toJsonStr(batchDetails));
                updatePointsBatch.setUsedPoints(bo.getUsedPoints() + bo.getRemainingPoints());
                updatePointsBatch.setFirstExpireDate(batchDetails.get(batchDetails.size() - 1).getExpire_date());

                updatePointsBatches.add(updatePointsBatch);
            }
        }
        // 修改不足额扣除积分批次
        if (ObjUtil.isNotNull(lastBatch) && negDedPoints > 0) {
            List<BatchDetail> batchDetails = JSONUtil.toList(lastBatch.getBatchDetail(), BatchDetail.class);
            int newFirstExpireIndex = -1;
            for (int i = 0; i < batchDetails.size(); i++) {
                BatchDetail bd = batchDetails.get(i);
                if (negDedPoints > bd.getRemaining()) {
                    // if - 扣除积分数量 > 批次明细数量
                    negDedPoints -= bd.getRemaining();
                    newFirstExpireIndex = i;
                    lastBatch.setRemainingPoints(lastBatch.getRemainingPoints() - bd.getRemaining());
                    lastBatch.setUsedPoints(lastBatch.getUsedPoints() + bd.getRemaining());
                    bd.setRemaining(0);
                    // 记录积分流水记录
                    PointsBatchDetailBO expiredPoints = BeanUtil.copyProperties(bd, PointsBatchDetailBO.class);
                    expiredPoints.setBatchId(lastBatch.getBatchId());
                    spentPointsList.add(expiredPoints);

                } else if (negDedPoints == bd.getRemaining()) {
                    // if - 扣除积分数量 == 批次明细数量
                    newFirstExpireIndex = i;
                    lastBatch.setUsedPoints(lastBatch.getUsedPoints() + bd.getRemaining());
                    lastBatch.setRemainingPoints(lastBatch.getRemainingPoints() - bd.getRemaining());
                    bd.setRemaining(0);
                    // 记录积分流水记录
                    PointsBatchDetailBO expiredPoints = BeanUtil.copyProperties(bd, PointsBatchDetailBO.class);
                    expiredPoints.setBatchId(lastBatch.getBatchId());
                    spentPointsList.add(expiredPoints);
                    break;

                } else {
                    // if - 扣除积分数量 < 批次明细数量
                    newFirstExpireIndex = i - 1;
                    lastBatch.setRemainingPoints(lastBatch.getRemainingPoints() - dedPoints);
                    lastBatch.setUsedPoints(lastBatch.getUsedPoints() + dedPoints);
                    bd.setRemaining(bd.getRemaining() - dedPoints);
                    // 记录积分流水记录
                    PointsBatchDetailBO expiredPoints = BeanUtil.copyProperties(bd, PointsBatchDetailBO.class);
                    expiredPoints.setBatchId(lastBatch.getBatchId());
                    spentPointsList.add(expiredPoints);
                    break;
                }
            }
            PointsBatch updatePointsBatch = new PointsBatch();
            updatePointsBatch.setId(lastBatch.getBatchId());
            updatePointsBatch.setUsedPoints(lastBatch.getUsedPoints());
            updatePointsBatch.setRemainingPoints(lastBatch.getRemainingPoints());
            updatePointsBatch.setFirstExpireDate(batchDetails.get(newFirstExpireIndex + 1) != null ?
                    batchDetails.get(newFirstExpireIndex + 1).getExpire_date() : batchDetails.get(newFirstExpireIndex).getExpire_date());
            updatePointsBatch.setBatchDetail(JSONUtil.toJsonStr(batchDetails));

            updatePointsBatches.add(updatePointsBatch);
        }

        /* step-4 更新积分批次记录 */
        boolean result = updateBatchById(updatePointsBatches);
        if (!result) {
            log.error("更新 [{}] ID [{}] 积分批次记录失败, 更新批次: {}", ownerTyp, ownerId, updatePointsBatches);
            throw new RuntimeException("更新积分批次记录失败");
        }

        return spentPointsList;
    }


    /**
     * 获取指定时间范围内到期的积分数量
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 即将到期积分数
     */
    @Override
    public Integer getNearExpiryTotalPoints(Long ownerId, PointsEnum ownerType, LocalDateTime startTime, LocalDateTime endTime) {
        return pointsBatchMapper.getNearExpiryTotalPoints(ownerId, ownerType.getValue(), startTime, endTime);
    }


    /**
     * 获取用户签到奖励积分批次
     *
     * @param ownerId 用户ID
     * @return 积分批次实体
     */
    @Override
    public PointsBatch getUserSignInPointsBatch(Long ownerId) {
        List<PointsBatch> signInRecord = lambdaQuery()
                .eq(PointsBatch::getOwnerId, ownerId)
                .eq(PointsBatch::getOwnerType, PointsEnum.USER)
                .eq(PointsBatch::getSourceType, PointsEnum.SIGN_IN_REWARD)
                .ge(PointsBatch::getCreatedTime, DateInitUtil.getFirstDayOfWeekDate())
                .list();
        if (CollUtil.isEmpty(signInRecord)) {
            return null;
        }
        if (signInRecord.size() > 1) {
            log.error("用户ID [{}] 签到记录合并异常, 签到记录数[{}]", ownerId, signInRecord);
            throw new RuntimeException("签到记录异常");
        }
        return signInRecord.get(0);
    }


    /**
     * 获取商家日积分批次
     *
     * @param merchantId 商家ID
     * @return 积分批次实体
     */
    @Override
    public PointsBatch getMerchantDailyPointsBatch(Long merchantId) {
        return null;
    }


    /**
     * 初始化签到奖励积分批次
     *
     * @param dto       签到积分参数
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @return 积分批次实体
     */
    @Override
    public PointsBatch initSignInPointsBatch(PointsAddChangeDTO dto, Long ownerId, PointsEnum ownerType) {
        BatchDetail batchDetail = new BatchDetail();
        batchDetail.setDate(LocalDate.now());
        batchDetail.setPoints(dto.getChangePoints());
        batchDetail.setRemaining(dto.getChangePoints());
        batchDetail.setExpire_date(dto.getValidEndTime());
        batchDetail.setBiz_id(Long.valueOf(dto.getBizId()));

        PointsBatch entity = new PointsBatch();
        entity.setUsedPoints(0);
        entity.setOwnerId(ownerId);
        entity.setOwnerType(ownerType);
        entity.setBatchPoints(dto.getChangePoints());
        entity.setSourceType(PointsEnum.SIGN_IN_REWARD);
        entity.setFirstExpireDate(dto.getValidEndTime());
        entity.setRemainingPoints(dto.getChangePoints());
        entity.setBatchDetail(JSONUtil.toJsonStr(List.of(batchDetail)));

        return entity;
    }


}
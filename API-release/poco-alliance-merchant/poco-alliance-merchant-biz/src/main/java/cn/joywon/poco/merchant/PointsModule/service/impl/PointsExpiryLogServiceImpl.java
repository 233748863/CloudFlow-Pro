package cn.joywon.poco.merchant.PointsModule.service.impl;

import cn.hutool.core.lang.Assert;
import cn.joywon.poco.merchant.PointsModule.bo.PointsBatchDetailBO;
import cn.joywon.poco.merchant.PointsModule.definition.PointsEnum;
import cn.joywon.poco.merchant.PointsModule.entity.PointsExpiryLog;
import cn.joywon.poco.merchant.PointsModule.mapper.PointExpiryLogMapper;
import cn.joywon.poco.merchant.PointsModule.service.IPointsExpiryLogService;
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
public class PointsExpiryLogServiceImpl extends
        ServiceImpl<PointExpiryLogMapper, PointsExpiryLog> implements IPointsExpiryLogService {

    private final PointExpiryLogMapper pointExpiryLogMapper;


    /**
     * 保存积分过期记录
     *
     * @param ownerId      用户/商家ID
     * @param expiryPoints 过期积分数量
     * @return 操作结果
     */
    @Override
    public boolean saveRecord(Long ownerId, Integer expiryPoints) {
        PointsExpiryLog expiryLog = new PointsExpiryLog();
        expiryLog.setExpiryDate(LocalDate.now());
        expiryLog.setExpiryPoints(expiryPoints);
        expiryLog.setOwnerId(ownerId);
        return save(expiryLog);
    }


    /**
     * 批量记录积分过期日志
     *
     * @param expiredPoints 过期积分列表
     * @param ownerId       用户/商家ID
     * @param ownerType     用户/商家类型
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordExpiredPoints(List<PointsBatchDetailBO> expiredPoints, Long ownerId, PointsEnum ownerType) {
        List<PointsExpiryLog> entities = new ArrayList<>();
        for (PointsBatchDetailBO bo : expiredPoints) {
            PointsExpiryLog entity = new PointsExpiryLog();
            entity.setExpiryDate(bo.getExpire_date());
            entity.setExpiryPoints(bo.getPoints());
            entity.setBatchId(bo.getBatchId());
            entity.setSourceId(bo.getBiz_id());
            entity.setOwnerType(ownerType);
            entity.setOwnerId(ownerId);
            entities.add(entity);
        }

        boolean result = saveBatch(entities);
        Assert.isTrue(result, () -> {
            log.error("批量记录积分过期日志失败, [{}]ID [{}] 过期积分: {} ", ownerId, ownerType, expiredPoints);
            throw new RuntimeException("批量记录积分过期日志失败");
        });
    }


    /**
     * 获取指定时间范围内过期的积分数量
     *
     * @param ownerId   用户/商家ID
     * @param ownerType 积分账户类型
     * @param startTime 查询开始时间
     * @param endTime   查询结束时间
     * @return 过期积分数
     */
    @Override
    public Integer getExpiredPointsTotal(Long ownerId, PointsEnum ownerType, LocalDateTime startTime, LocalDateTime endTime) {
        return pointExpiryLogMapper.getExpiredPointsTotal(ownerId, ownerType.getValue(), startTime, endTime);
    }


}
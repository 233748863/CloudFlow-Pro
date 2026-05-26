package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.VehicleFuelLog;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.OaRiskAlertMapper;
import com.cloudflow.oa.mapper.VehicleFuelLogMapper;
import com.cloudflow.oa.service.IVehicleFuelLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * OA-P0-1 车辆油耗服务实现。
 *
 * <ul>
 *   <li>保存时按 endMileage 与上一次记录差值自动算 driveDistance 和 百公里油耗;</li>
 *   <li>百公里油耗 > 同车历史均值 120% 时写入 oa_risk_alert.</li>
 * </ul>
 */
@Slf4j
@Service
public class VehicleFuelLogServiceImpl extends ServiceImpl<VehicleFuelLogMapper, VehicleFuelLog>
        implements IVehicleFuelLogService {

    private static final BigDecimal ANOMALY_RATIO = new BigDecimal("1.20");
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    @Autowired
    private OaRiskAlertMapper riskAlertMapper;

    @Override
    public Page<VehicleFuelLog> queryPage(Long vehicleId, String startDate, String endDate,
                                          Integer pageNum, Integer pageSize) {
        Page<VehicleFuelLog> page = new Page<>(pageNum == null ? 1 : pageNum,
                pageSize == null ? 10 : pageSize);
        LambdaQueryWrapper<VehicleFuelLog> wrapper = new LambdaQueryWrapper<>();
        if (vehicleId != null) {
            wrapper.eq(VehicleFuelLog::getVehicleId, vehicleId);
        }
        if (StringUtils.hasText(startDate)) {
            wrapper.ge(VehicleFuelLog::getFuelDate, LocalDate.parse(startDate));
        }
        if (StringUtils.hasText(endDate)) {
            wrapper.le(VehicleFuelLog::getFuelDate, LocalDate.parse(endDate));
        }
        wrapper.orderByDesc(VehicleFuelLog::getFuelDate, VehicleFuelLog::getFuelLogId);
        return baseMapper.selectPage(page, wrapper);
    }

    @Override
    public List<VehicleFuelLog> listByVehicle(Long vehicleId, Integer limit) {
        if (vehicleId == null) {
            return List.of();
        }
        LambdaQueryWrapper<VehicleFuelLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VehicleFuelLog::getVehicleId, vehicleId)
                .orderByDesc(VehicleFuelLog::getFuelDate, VehicleFuelLog::getFuelLogId)
                .last(limit != null && limit > 0 ? "LIMIT " + limit : "LIMIT 30");
        return baseMapper.selectList(wrapper);
    }

    @Override
    public boolean saveFuelLog(VehicleFuelLog log) {
        autoFillDistanceAndConsumption(log);
        boolean ok = super.save(log);
        if (ok) {
            detectAndAlert(log);
        }
        return ok;
    }

    @Override
    public boolean updateFuelLog(VehicleFuelLog log) {
        if (log == null || log.getFuelLogId() == null) {
            return false;
        }
        autoFillDistanceAndConsumption(log);
        return super.updateById(log);
    }

    private void autoFillDistanceAndConsumption(VehicleFuelLog log) {
        if (log == null || log.getVehicleId() == null) {
            return;
        }
        if (log.getEndMileage() != null) {
            BigDecimal start = log.getStartMileage();
            if (start == null) {
                VehicleFuelLog prev = findPreviousLog(log.getVehicleId(), log.getFuelDate(), log.getFuelLogId());
                if (prev != null && prev.getEndMileage() != null) {
                    start = prev.getEndMileage();
                    log.setStartMileage(start);
                }
            }
            if (start != null) {
                BigDecimal distance = log.getEndMileage().subtract(start);
                if (distance.compareTo(BigDecimal.ZERO) > 0) {
                    log.setDriveDistance(distance);
                    if (log.getLiters() != null && log.getLiters().compareTo(BigDecimal.ZERO) > 0) {
                        log.setFuelPer100km(log.getLiters().multiply(HUNDRED)
                                .divide(distance, 2, RoundingMode.HALF_UP));
                    }
                }
            }
        }
        if (log.getTotalAmount() == null && log.getLiters() != null && log.getUnitPrice() != null) {
            log.setTotalAmount(log.getLiters().multiply(log.getUnitPrice())
                    .setScale(2, RoundingMode.HALF_UP));
        }
    }

    private VehicleFuelLog findPreviousLog(Long vehicleId, LocalDate fuelDate, Long excludeId) {
        LambdaQueryWrapper<VehicleFuelLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VehicleFuelLog::getVehicleId, vehicleId);
        if (excludeId != null) {
            wrapper.ne(VehicleFuelLog::getFuelLogId, excludeId);
        }
        if (fuelDate != null) {
            wrapper.le(VehicleFuelLog::getFuelDate, fuelDate);
        }
        wrapper.isNotNull(VehicleFuelLog::getEndMileage)
                .orderByDesc(VehicleFuelLog::getFuelDate, VehicleFuelLog::getFuelLogId)
                .last("LIMIT 1");
        return baseMapper.selectOne(wrapper);
    }

    private void detectAndAlert(VehicleFuelLog current) {
        BigDecimal currentConsumption = current.getFuelPer100km();
        if (currentConsumption == null || currentConsumption.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        LambdaQueryWrapper<VehicleFuelLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VehicleFuelLog::getVehicleId, current.getVehicleId())
                .ne(VehicleFuelLog::getFuelLogId, current.getFuelLogId())
                .isNotNull(VehicleFuelLog::getFuelPer100km)
                .orderByDesc(VehicleFuelLog::getFuelDate)
                .last("LIMIT 10");
        List<VehicleFuelLog> history = baseMapper.selectList(wrapper);
        if (history.isEmpty()) {
            return;
        }
        BigDecimal sum = BigDecimal.ZERO;
        int n = 0;
        for (VehicleFuelLog h : history) {
            if (h.getFuelPer100km() != null && h.getFuelPer100km().compareTo(BigDecimal.ZERO) > 0) {
                sum = sum.add(h.getFuelPer100km());
                n++;
            }
        }
        if (n == 0) {
            return;
        }
        BigDecimal avg = sum.divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP);
        BigDecimal threshold = avg.multiply(ANOMALY_RATIO).setScale(2, RoundingMode.HALF_UP);
        if (currentConsumption.compareTo(threshold) > 0) {
            try {
                OaRiskAlert alert = new OaRiskAlert();
                alert.setTenantId(current.getTenantId());
                alert.setBusinessType("OA_VEHICLE_FUEL");
                alert.setBusinessId(current.getFuelLogId());
                alert.setRiskCode("FUEL_CONSUMPTION_HIGH");
                alert.setRiskName("百公里油耗异常偏高");
                alert.setRiskLevel("WARN");
                alert.setRiskStatus("OPEN");
                alert.setRiskSource("AUTO");
                alert.setOwnerId(current.getDriverId());
                alert.setOwnerName(current.getDriverName());
                alert.setDetectedTime(LocalDateTime.now());
                alert.setHandleRemark("当前 " + currentConsumption + " L/100km, 历史均值 " + avg + " L/100km, 阈值 " + threshold);
                riskAlertMapper.insert(alert);
            } catch (Exception e) {
                log.warn("写入油耗异常风险提醒失败 vehicleId={} err={}", current.getVehicleId(), e.getMessage());
            }
        }
    }

    @Override
    public DynamicMapVO statsByVehicle(Long vehicleId, Integer recentDays) {
        Map<String, Object> result = new HashMap<>();
        if (vehicleId == null) {
            return DynamicMapVO.from(result);
        }
        LambdaQueryWrapper<VehicleFuelLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VehicleFuelLog::getVehicleId, vehicleId);
        if (recentDays != null && recentDays > 0) {
            wrapper.ge(VehicleFuelLog::getFuelDate, LocalDate.now().minusDays(recentDays));
        }
        wrapper.orderByAsc(VehicleFuelLog::getFuelDate);
        List<VehicleFuelLog> logs = baseMapper.selectList(wrapper);

        BigDecimal totalLiters = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        BigDecimal sumConsumption = BigDecimal.ZERO;
        int consumptionCount = 0;
        TreeMap<String, BigDecimal> monthlyAmount = new TreeMap<>();
        TreeMap<String, BigDecimal> monthlyConsumption = new TreeMap<>();
        TreeMap<String, Integer> monthlyConsumptionCount = new TreeMap<>();

        for (VehicleFuelLog l : logs) {
            if (l.getLiters() != null) {
                totalLiters = totalLiters.add(l.getLiters());
            }
            if (l.getTotalAmount() != null) {
                totalAmount = totalAmount.add(l.getTotalAmount());
            }
            if (l.getFuelPer100km() != null && l.getFuelPer100km().compareTo(BigDecimal.ZERO) > 0) {
                sumConsumption = sumConsumption.add(l.getFuelPer100km());
                consumptionCount++;
            }
            if (l.getFuelDate() != null) {
                String month = l.getFuelDate().toString().substring(0, 7);
                if (l.getTotalAmount() != null) {
                    monthlyAmount.merge(month, l.getTotalAmount(), BigDecimal::add);
                }
                if (l.getFuelPer100km() != null && l.getFuelPer100km().compareTo(BigDecimal.ZERO) > 0) {
                    monthlyConsumption.merge(month, l.getFuelPer100km(), BigDecimal::add);
                    monthlyConsumptionCount.merge(month, 1, Integer::sum);
                }
            }
        }

        result.put("count", logs.size());
        result.put("totalLiters", totalLiters);
        result.put("totalAmount", totalAmount);
        result.put("avgFuelPer100km", consumptionCount == 0 ? BigDecimal.ZERO
                : sumConsumption.divide(BigDecimal.valueOf(consumptionCount), 2, RoundingMode.HALF_UP));
        result.put("monthlyAmount", monthlyAmount);
        Map<String, BigDecimal> monthlyAvg = monthlyConsumption.entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        e -> e.getValue().divide(BigDecimal.valueOf(Objects.requireNonNullElse(
                                monthlyConsumptionCount.get(e.getKey()), 1)), 2, RoundingMode.HALF_UP),
                        (a, b) -> a, TreeMap::new));
        result.put("monthlyFuelPer100km", monthlyAvg);
        return DynamicMapVO.from(result);
    }
}

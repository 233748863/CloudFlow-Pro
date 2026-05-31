package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.domain.VehicleMaintenance;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.domain.VehicleViolation;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.domain.vo.VehicleProfileVO;
import com.cloudflow.oa.domain.vo.VehicleScheduleItemVO;
import com.cloudflow.oa.mapper.OaRiskAlertMapper;
import com.cloudflow.oa.mapper.SysVehicleMapper;
import com.cloudflow.oa.mapper.VehicleExpenseMapper;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import com.cloudflow.oa.service.IVehicleMaintenanceService;
import com.cloudflow.oa.service.IVehicleService;
import com.cloudflow.oa.service.IVehicleViolationService;
import com.cloudflow.oa.util.OaContractConstants;
import com.cloudflow.oa.util.VehicleConstants;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class VehicleServiceImpl extends ServiceImpl<SysVehicleMapper, SysVehicle> implements IVehicleService {

    private final SysVehicleMapper vehicleMapper;
    private final VehicleUsageMapper usageMapper;
    private final VehicleExpenseMapper expenseMapper;
    private final OaRiskAlertMapper riskAlertMapper;
    private final IVehicleMaintenanceService vehicleMaintenanceService;
    private final IVehicleViolationService vehicleViolationService;

    @Override
    public PageResult<SysVehicle> queryPage(SysVehicle vehicle, PageQuery pageQuery) {
        Page<SysVehicle> page = (Page<SysVehicle>) vehicleMapper.selectVehiclePage(pageQuery.build(), vehicle);
        return PageResult.build(page);
    }

    @Override
    public List<SysVehicle> listAvailable() {
        return vehicleMapper.selectAvailableWithRuntime();
    }

    @Override
    public DynamicMapVO getVehicleStats() {
        List<SysVehicle> allVehicles = list();
        long available = allVehicles.stream().filter(v -> VehicleConstants.VEHICLE_STATUS_AVAILABLE.equals(v.getStatus())).count();
        long maintenance = allVehicles.stream().filter(v -> VehicleConstants.VEHICLE_STATUS_MAINTENANCE.equals(v.getStatus())).count();
        long scrapped = allVehicles.stream().filter(v -> VehicleConstants.VEHICLE_STATUS_SCRAPPED.equals(v.getStatus())).count();

        long booked = usageMapper.selectSchedule(null, LocalDateTime.now(), LocalDateTime.now().plusYears(1)).stream()
                .filter(item -> VehicleConstants.VEHICLE_STATUS_BOOKED.equals(item.getRuntimeStatus()))
                .count();
        long inUse = usageMapper.selectSchedule(null, LocalDateTime.now().minusDays(1), LocalDateTime.now().plusDays(1)).stream()
                .filter(item -> VehicleConstants.VEHICLE_STATUS_IN_USE.equals(item.getRuntimeStatus()))
                .count();

        long insuranceExpiring = allVehicles.stream().filter(v -> isDateWithinDays(v.getInsuranceExpiry(), 30)).count();
        long annualInspectionExpiring = allVehicles.stream().filter(v -> isDateWithinDays(v.getAnnualInspectionExpiry(), 30)).count();
        long maintenanceDue = allVehicles.stream().filter(this::isMaintenanceDue).count();
        long pendingViolation = vehicleViolationService.count(new LambdaQueryWrapper<VehicleViolation>()
                .in(VehicleViolation::getStatus, "PENDING", "PROCESSING"));
        long openRiskCount = riskAlertMapper.selectCount(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getBusinessType, VehicleConstants.BUSINESS_TYPE_VEHICLE)
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING));
        BigDecimal expense30d = expenseMapper.selectExpenseStats(null, null) == null
                ? BigDecimal.ZERO
                : castBigDecimal(expenseMapper.selectExpenseStats(null, null).get("totalAmount"));

        LocalDateTime last30Days = LocalDateTime.now().minusDays(30);
        long usage30d = count(new LambdaQueryWrapper<SysVehicle>().isNotNull(SysVehicle::getVehicleId));
        usage30d = usageMapper.selectSchedule(null, last30Days, LocalDateTime.now()).size();

        Map<String, Object> stats = new HashMap<>();
        stats.put("total", allVehicles.size());
        stats.put("available", available);
        stats.put("booked", booked);
        stats.put("inUse", inUse);
        stats.put("maintenance", maintenance);
        stats.put("scrapped", scrapped);
        stats.put("insuranceExpiringSoon", insuranceExpiring);
        stats.put("annualInspectionExpiringSoon", annualInspectionExpiring);
        stats.put("maintenanceDueSoon", maintenanceDue);
        stats.put("pendingViolationCount", pendingViolation);
        stats.put("overdueRiskCount", openRiskCount);
        stats.put("expenseAmount30d", expense30d);
        stats.put("usageCount30d", usage30d);
        return DynamicMapVO.from(stats);
    }

    @Override
    public VehicleProfileVO getVehicleProfile(Long vehicleId) {
        SysVehicle vehicle = getById(vehicleId);
        if (vehicle == null) {
            return null;
        }

        VehicleProfileVO profile = new VehicleProfileVO();
        profile.setVehicle(vehicle);
        profile.setCurrentUsage(usageMapper.selectCurrentUsageByVehicleId(vehicleId));
        profile.setNextUsage(usageMapper.selectNextUsageByVehicleId(vehicleId));
        profile.setRecentUsages(usageMapper.selectRecentUsagesByVehicleId(vehicleId, 5));
        profile.setRecentExpenses(expenseMapper.selectRecentExpensesByVehicleId(vehicleId, 10));

        List<VehicleMaintenance> maintenances = vehicleMaintenanceService.listByVehicleId(vehicleId, 5);
        List<VehicleViolation> violations = vehicleViolationService.listByVehicleId(vehicleId, 5);
        List<OaRiskAlert> risks = riskAlertMapper.selectList(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getBusinessType, VehicleConstants.BUSINESS_TYPE_VEHICLE)
                .eq(OaRiskAlert::getBusinessId, vehicleId)
                .orderByDesc(OaRiskAlert::getDetectedTime)
                .last("LIMIT 10"));

        profile.setMaintenances(maintenances);
        profile.setViolations(violations);
        profile.setRisks(risks);

        BigDecimal expense30 = expenseMapper.sumExpenseAmountByVehicle(vehicleId, 30);
        BigDecimal expense90 = expenseMapper.sumExpenseAmountByVehicle(vehicleId, 90);
        BigDecimal distance30 = calculateDistance(profile.getRecentUsages(), 30);
        profile.setExpenseAmount30d(expense30);
        profile.setExpenseAmount90d(expense90);
        profile.setTripDistance30d(distance30);
        profile.setCostPerKm30d(distance30.compareTo(BigDecimal.ZERO) > 0
                ? expense30.divide(distance30, 2, java.math.RoundingMode.HALF_UP)
                : BigDecimal.ZERO);

        return profile;
    }

    @Override
    public List<VehicleScheduleItemVO> getVehicleSchedule(Long vehicleId, LocalDateTime startDate, LocalDateTime endDate) {
        return usageMapper.selectSchedule(vehicleId, startDate, endDate);
    }

    private boolean isDateWithinDays(LocalDateTime dateTime, int days) {
        if (dateTime == null) {
            return false;
        }
        long diff = ChronoUnit.DAYS.between(LocalDateTime.now().toLocalDate(), dateTime.toLocalDate());
        return diff >= 0 && diff <= days;
    }

    private boolean isMaintenanceDue(SysVehicle vehicle) {
        return vehicle.getNextMaintenanceMileage() != null
                && vehicle.getMileage() != null
                && vehicle.getNextMaintenanceMileage().subtract(vehicle.getMileage()).compareTo(BigDecimal.valueOf(500)) <= 0;
    }

    private BigDecimal calculateDistance(List<VehicleUsage> usages, int days) {
        if (usages == null || usages.isEmpty()) {
            return BigDecimal.ZERO;
        }
        LocalDateTime limit = LocalDateTime.now().minusDays(days);
        return usages.stream()
                .filter(item -> item.getActualEndTime() != null && item.getActualEndTime().isAfter(limit))
                .map(item -> item.getTripDistance() == null ? BigDecimal.ZERO : item.getTripDistance())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal castBigDecimal(Object value) {
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value == null) {
            return BigDecimal.ZERO;
        }
        return new BigDecimal(String.valueOf(value));
    }
}

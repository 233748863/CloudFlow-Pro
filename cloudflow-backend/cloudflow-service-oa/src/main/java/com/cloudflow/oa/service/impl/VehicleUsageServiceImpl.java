package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.domain.VehicleViolation;
import com.cloudflow.oa.domain.dto.VehicleDispatchDTO;
import com.cloudflow.oa.mapper.OaRiskAlertMapper;
import com.cloudflow.oa.mapper.SysVehicleMapper;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import com.cloudflow.oa.mapper.VehicleViolationMapper;
import com.cloudflow.oa.service.IVehicleUsageService;
import com.cloudflow.oa.service.IWorkflowService;
import com.cloudflow.oa.util.OaContractConstants;
import com.cloudflow.oa.util.VehicleConstants;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class VehicleUsageServiceImpl extends ServiceImpl<VehicleUsageMapper, VehicleUsage> implements IVehicleUsageService {

    private final IWorkflowService workflowService;
    private final VehicleUsageMapper usageMapper;
    private final SysVehicleMapper vehicleMapper;
    private final OaRiskAlertMapper riskAlertMapper;
    private final VehicleViolationMapper violationMapper;

    @Override
    public PageResult<VehicleUsage> queryPage(VehicleUsage usage, PageQuery pageQuery) {
        Page<VehicleUsage> page = (Page<VehicleUsage>) usageMapper.selectUsagePage(pageQuery.build(), usage);
        return PageResult.build(page);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> submitUsage(VehicleUsage usage) {
        Long count = this.count(new LambdaQueryWrapper<VehicleUsage>()
                .eq(VehicleUsage::getVehicleId, usage.getVehicleId())
                .in(VehicleUsage::getStatus,
                        VehicleConstants.USAGE_STATUS_PENDING,
                        VehicleConstants.USAGE_STATUS_APPROVED,
                        VehicleConstants.USAGE_STATUS_IN_USE)
                .and(w -> w.lt(VehicleUsage::getStartTime, usage.getEndTime())
                        .gt(VehicleUsage::getEndTime, usage.getStartTime())));

        if (count > 0) {
            return R.fail("所选车辆在该时间段已被占用");
        }

        usage.setStatus(VehicleConstants.USAGE_STATUS_PENDING);
        usage.setDriverMode(usage.getDriverMode() == null ? 0 : usage.getDriverMode());
        this.save(usage);

        Map<String, Object> variables = new HashMap<>();
        variables.put("initiator", usage.getApplicantId());
        variables.put("vehicleInfo", usage.getReason());
        WorkflowCallbackConstants.applyCallbackMetadata(
                variables,
                OaBusinessTypes.VEHICLE_APPROVAL,
                usage.getUsageId(),
                String.valueOf(usage.getUsageId()),
                "workflow:stream:approval-callback:oa"
        );

        R<?> wfResult = workflowService.startProcess("vehicle_approval", usage.getUsageId().toString(), variables);
        if (wfResult.getCode() != 200) {
            throw new RuntimeException("用车工作流启动失败: " + wfResult.getMsg());
        }

        String instanceId = extractInstanceId(wfResult.getData());
        if (instanceId != null) {
            usage.setProcessInstanceId(instanceId);
            this.updateById(usage);
        }

        return R.ok();
    }

    @Override
    public VehicleUsage getUsageDetail(Long usageId) {
        return usageMapper.selectUsageDetail(usageId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> approveUsage(Long usageId, boolean approved, String remark) {
        VehicleUsage usage = this.getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!VehicleConstants.USAGE_STATUS_PENDING.equals(usage.getStatus())) {
            return R.fail("当前状态不允许执行审批操作");
        }
        usage.setStatus(approved ? VehicleConstants.USAGE_STATUS_APPROVED : VehicleConstants.USAGE_STATUS_REJECTED);
        usage.setDispatchRemark(remark);
        this.updateById(usage);
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> dispatchVehicle(Long usageId, VehicleDispatchDTO dto) {
        VehicleUsage usage = getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!VehicleConstants.USAGE_STATUS_APPROVED.equals(usage.getStatus())) {
            return R.fail("当前状态不允许派车");
        }

        int driverMode = dto.getDriverMode() == null ? 0 : dto.getDriverMode();
        usage.setDriverMode(driverMode);
        usage.setDriverId(driverMode == 0 ? usage.getApplicantId() : dto.getDriverId());
        usage.setStartMileage(dto.getStartMileage());
        usage.setDispatchRemark(dto.getDispatchRemark());
        usage.setDispatchTime(LocalDateTime.now());
        usage.setActualStartTime(dto.getActualStartTime() == null ? LocalDateTime.now() : dto.getActualStartTime());
        usage.setStatus(VehicleConstants.USAGE_STATUS_IN_USE);
        updateById(usage);

        if (dto.getStartMileage() != null) {
            SysVehicle vehicle = vehicleMapper.selectById(usage.getVehicleId());
            if (vehicle != null) {
                vehicle.setMileage(dto.getStartMileage());
                vehicleMapper.updateById(vehicle);
            }
        }

        clearOpenRisk(usage.getVehicleId(), VehicleConstants.RISK_CODE_OVERDUE_RETURN);
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> returnVehicle(Long usageId, double endMileage, String remark, String returnLocation) {
        VehicleUsage usage = this.getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!VehicleConstants.USAGE_STATUS_IN_USE.equals(usage.getStatus())
                && !VehicleConstants.USAGE_STATUS_APPROVED.equals(usage.getStatus())) {
            return R.fail("当前状态不允许执行还车操作");
        }
        usage.setStatus(VehicleConstants.USAGE_STATUS_COMPLETED);
        usage.setEndMileage(BigDecimal.valueOf(endMileage));
        usage.setActualEndTime(LocalDateTime.now());
        usage.setReturnRemark(remark);
        if (returnLocation != null && !returnLocation.isBlank()) {
            usage.setReturnLocation(returnLocation);
        }
        this.updateById(usage);

        SysVehicle vehicle = vehicleMapper.selectById(usage.getVehicleId());
        if (vehicle != null) {
            vehicle.setMileage(BigDecimal.valueOf(endMileage));
            if (usage.getReturnLocation() != null && !usage.getReturnLocation().isBlank()) {
                vehicle.setLocation(usage.getReturnLocation());
            }
            vehicleMapper.updateById(vehicle);
        }

        clearOpenRisk(usage.getVehicleId(), VehicleConstants.RISK_CODE_OVERDUE_RETURN);
        scanVehicleRisks(usage.getVehicleId());
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> cancelUsage(Long usageId) {
        VehicleUsage usage = this.getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!VehicleConstants.USAGE_STATUS_PENDING.equals(usage.getStatus())) {
            return R.fail("只有待审批状态的申请才可以取消");
        }
        usage.setStatus(VehicleConstants.USAGE_STATUS_CANCELLED);
        this.updateById(usage);
        return R.ok();
    }

    public void scanVehicleRisks(Long vehicleId) {
        if (vehicleId == null) {
            return;
        }
        SysVehicle vehicle = vehicleMapper.selectById(vehicleId);
        if (vehicle == null) {
            return;
        }

        VehicleUsage currentUsage = usageMapper.selectCurrentUsageByVehicleId(vehicleId);
        if (currentUsage != null && currentUsage.getEndTime() != null
                && LocalDateTime.now().isAfter(currentUsage.getEndTime().plusMinutes(30))) {
            createOpenRisk(vehicleId, VehicleConstants.RISK_CODE_OVERDUE_RETURN, "车辆逾期未归还", OaContractConstants.RISK_LEVEL_HIGH);
        }

        if (vehicle.getInsuranceExpiry() != null && withinThreshold(vehicle.getInsuranceExpiry(), 30)) {
            createOpenRisk(vehicleId, VehicleConstants.RISK_CODE_INSURANCE_EXPIRY, "车辆保险即将到期", OaContractConstants.RISK_LEVEL_MEDIUM);
        }
        if (vehicle.getAnnualInspectionExpiry() != null && withinThreshold(vehicle.getAnnualInspectionExpiry(), 30)) {
            createOpenRisk(vehicleId, VehicleConstants.RISK_CODE_INSPECTION_EXPIRY, "车辆年检即将到期", OaContractConstants.RISK_LEVEL_MEDIUM);
        }
        if (vehicle.getNextMaintenanceMileage() != null && vehicle.getMileage() != null
                && vehicle.getNextMaintenanceMileage().subtract(vehicle.getMileage()).compareTo(BigDecimal.valueOf(500)) <= 0) {
            createOpenRisk(vehicleId, VehicleConstants.RISK_CODE_MAINTENANCE_DUE, "车辆接近保养里程", OaContractConstants.RISK_LEVEL_MEDIUM);
        }
        long pendingViolations = violationMapper.selectCount(new LambdaQueryWrapper<VehicleViolation>()
                .eq(VehicleViolation::getVehicleId, vehicleId)
                .in(VehicleViolation::getStatus, "PENDING", "PROCESSING"));
        if (pendingViolations > 0) {
            createOpenRisk(vehicleId, VehicleConstants.RISK_CODE_PENDING_VIOLATION, "车辆存在未处理违章", OaContractConstants.RISK_LEVEL_HIGH);
        }
    }

    private void createOpenRisk(Long vehicleId, String riskCode, String riskName, String riskLevel) {
        Long exists = riskAlertMapper.selectCount(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getBusinessType, VehicleConstants.BUSINESS_TYPE_VEHICLE)
                .eq(OaRiskAlert::getBusinessId, vehicleId)
                .eq(OaRiskAlert::getRiskCode, riskCode)
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING));
        if (exists != null && exists > 0) {
            return;
        }

        OaRiskAlert risk = new OaRiskAlert();
        risk.setBusinessType(VehicleConstants.BUSINESS_TYPE_VEHICLE);
        risk.setBusinessId(vehicleId);
        risk.setRiskCode(riskCode);
        risk.setRiskName(riskName);
        risk.setRiskLevel(riskLevel);
        risk.setRiskSource(OaContractConstants.RISK_SOURCE_RULE);
        risk.setRiskStatus(OaContractConstants.RISK_STATUS_OPEN);
        risk.setDetectedTime(LocalDateTime.now());
        risk.setCreateTime(LocalDateTime.now());
        risk.setUpdateTime(LocalDateTime.now());
        riskAlertMapper.insert(risk);
    }

    private void clearOpenRisk(Long vehicleId, String riskCode) {
        OaRiskAlert risk = riskAlertMapper.selectOne(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getBusinessType, VehicleConstants.BUSINESS_TYPE_VEHICLE)
                .eq(OaRiskAlert::getBusinessId, vehicleId)
                .eq(OaRiskAlert::getRiskCode, riskCode)
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING)
                .last("LIMIT 1"));
        if (risk != null) {
            risk.setRiskStatus(OaContractConstants.RISK_STATUS_CLOSED);
            risk.setHandledTime(LocalDateTime.now());
            risk.setUpdateTime(LocalDateTime.now());
            riskAlertMapper.updateById(risk);
        }
    }

    private boolean withinThreshold(LocalDateTime target, int days) {
        LocalDateTime now = LocalDateTime.now();
        return !target.isBefore(now) && !target.isAfter(now.plusDays(days));
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }
}

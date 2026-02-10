package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import com.cloudflow.oa.service.IVehicleUsageService;
import com.cloudflow.oa.service.IWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class VehicleUsageServiceImpl extends ServiceImpl<VehicleUsageMapper, VehicleUsage> implements IVehicleUsageService {

    private final IWorkflowService workflowService;

    @Override
    public PageResult<VehicleUsage> queryPage(VehicleUsage usage, PageQuery pageQuery) {
        LambdaQueryWrapper<VehicleUsage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(usage.getVehicleId() != null, VehicleUsage::getVehicleId, usage.getVehicleId())
               .eq(usage.getApplicantId() != null, VehicleUsage::getApplicantId, usage.getApplicantId())
               .orderByDesc(VehicleUsage::getCreateTime);
        
        Page<VehicleUsage> page = this.page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> submitUsage(VehicleUsage usage) {
        // 1. Conflict Detection
        // Check if there is any overlapping usage for the same vehicle that is NOT rejected or cancelled
        // Status: 2=Rejected, 5=Cancelled. Overlap: (StartA < EndB) and (EndA > StartB)
        Long count = this.count(new LambdaQueryWrapper<VehicleUsage>()
            .eq(VehicleUsage::getVehicleId, usage.getVehicleId())
            .notIn(VehicleUsage::getStatus, "2", "5") 
            .and(w -> w.lt(VehicleUsage::getStartTime, usage.getEndTime())
                       .gt(VehicleUsage::getEndTime, usage.getStartTime()))
        );

        if (count > 0) {
            return R.fail("The selected vehicle is already booked for the requested time slot.");
        }

        // 2. Save Usage Record
        usage.setStatus("0"); // 0=Pending
        this.save(usage);

        // 3. Start Workflow
        Map<String, Object> variables = new HashMap<>();
        variables.put("initiator", usage.getApplicantId());
        variables.put("vehicleInfo", usage.getReason());
        
        // Assuming "vehicle_approval" is the key for the process definition
        R<?> wfResult = workflowService.startProcess("vehicle_approval", usage.getUsageId().toString(), variables);
        
        if (wfResult.getCode() != 200) {
            throw new RuntimeException("Failed to start workflow: " + wfResult.getMsg());
        }

        // Update process instance ID if returned (assuming the workflow service returns it, or we fetch it)
        // For simplicity, we assume successful start is enough. 
        // Ideally workflowService.startProcess returns the instance ID.
        // Let's assume we can get it from wfResult if needed, or just leave it for now as the linkage is via BusinessKey.
        
        return R.ok();
    }

    @Override
    public void approveUsage(Long usageId) {
        VehicleUsage usage = this.getById(usageId);
        if (usage != null) {
            usage.setStatus("1"); // Approved
            this.updateById(usage);
        }
    }

    @Override
    public void rejectUsage(Long usageId) {
        VehicleUsage usage = this.getById(usageId);
        if (usage != null) {
            usage.setStatus("2"); // Rejected
            this.updateById(usage);
        }
    }
}

package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.mapper.VehicleUsageMapper;
import com.cloudflow.oa.service.IVehicleUsageService;
import com.cloudflow.oa.service.IWorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
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
        Long count = this.count(new LambdaQueryWrapper<VehicleUsage>()
                .eq(VehicleUsage::getVehicleId, usage.getVehicleId())
                .notIn(VehicleUsage::getStatus, "2", "5")
                .and(w -> w.lt(VehicleUsage::getStartTime, usage.getEndTime())
                        .gt(VehicleUsage::getEndTime, usage.getStartTime())));

        if (count > 0) {
            return R.fail("所选车辆在该时间段已被占用");
        }

        usage.setStatus("0");
        this.save(usage);

        Map<String, Object> variables = new HashMap<>();
        variables.put("initiator", usage.getApplicantId());
        variables.put("vehicleInfo", usage.getReason());
        // 用车流程同样走 OA 专属回调流，审批结果由 OA 本地异步回写。
        WorkflowCallbackStreamConstants.applyCallbackMetadata(
                variables,
                WorkflowCallbackStreamConstants.BUSINESS_TYPE_VEHICLE_APPROVAL,
                usage.getUsageId(),
                String.valueOf(usage.getUsageId())
        );

        R<?> wfResult = workflowService.startProcess("vehicle_approval", usage.getUsageId().toString(), variables);
        if (wfResult.getCode() != 200) {
            throw new RuntimeException("用车工作流启动失败: " + wfResult.getMsg());
        }

        // 优先在提交这一步同步回写 processInstanceId?避免首次查询时业务表还是空值。
        String instanceId = extractInstanceId(wfResult.getData());
        if (instanceId != null) {
            usage.setProcessInstanceId(instanceId);
            this.updateById(usage);
        }

        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> approveUsage(Long usageId, boolean approved, String remark) {
        VehicleUsage usage = this.getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!"0".equals(usage.getStatus())) {
            return R.fail("当前状态不允许执行审批操作");
        }
        if (approved) {
            usage.setStatus("1");
        } else {
            usage.setStatus("2");
        }
        this.updateById(usage);
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> returnVehicle(Long usageId, double endMileage, String remark) {
        VehicleUsage usage = this.getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!"1".equals(usage.getStatus()) && !"3".equals(usage.getStatus())) {
            return R.fail("当前状态不允许执行还车操作");
        }
        usage.setStatus("4");
        usage.setEndMileage(BigDecimal.valueOf(endMileage));
        this.updateById(usage);
        return R.ok();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Void> cancelUsage(Long usageId) {
        VehicleUsage usage = this.getById(usageId);
        if (usage == null) {
            return R.fail("用车记录不存在");
        }
        if (!"0".equals(usage.getStatus())) {
            return R.fail("只有待审批状态的申请才可以取消");
        }
        usage.setStatus("5");
        this.updateById(usage);
        return R.ok();
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

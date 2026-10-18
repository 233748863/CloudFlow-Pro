package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.OaAssetMaintenancePlan;
import com.cloudflow.oa.domain.OaAssetMaintenanceTask;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaAssetMaintenancePlanMapper;
import com.cloudflow.oa.mapper.OaAssetMaintenanceTaskMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaAssetMaintenanceService {
    private final SysAssetMapper assetMapper;
    private final OaAssetMaintenancePlanMapper planMapper;
    private final OaAssetMaintenanceTaskMapper taskMapper;
    private final OaIdentityReferenceMapper identities;
    private final OaSupplierGovernanceService suppliers;
    private final OaReminderService reminders;
    private final SysConfigHelper config;

    public List<OaAssetMaintenancePlan> plans(Long assetId) {
        OaRecordSupport.active(assetMapper.selectById(assetId));
        return planMapper.selectList(new LambdaQueryWrapper<OaAssetMaintenancePlan>().eq(OaAssetMaintenancePlan::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetMaintenancePlan::getAssetId, assetId).eq(OaAssetMaintenancePlan::getDeleted, 0).orderByAsc(OaAssetMaintenancePlan::getNextDueDate));
    }

    public List<OaAssetMaintenanceTask> tasks(Long assetId) {
        OaRecordSupport.active(assetMapper.selectById(assetId));
        return taskMapper.selectList(new LambdaQueryWrapper<OaAssetMaintenanceTask>().eq(OaAssetMaintenanceTask::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetMaintenanceTask::getAssetId, assetId).eq(OaAssetMaintenanceTask::getDeleted, 0).orderByDesc(OaAssetMaintenanceTask::getPlannedDate));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存资产维保计划", spel = "#plan")
    public Long savePlan(OaAssetMaintenancePlan plan) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(plan.getAssetId(), OaRecordSupport.tenantId()));
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("终止使用的资产不能安排维保");
        plan.setPlanName(OaRecordSupport.text(plan.getPlanName(), 200, "维保名称"));
        plan.setMaintenanceType(OaRecordSupport.code(plan.getMaintenanceType(), "PREVENTIVE", Set.of("PREVENTIVE", "CALIBRATION", "INSPECTION")));
        plan.setFrequency(OaRecordSupport.code(plan.getFrequency(), "MONTHLY", Set.of("MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "CUSTOM")));
        if ("CUSTOM".equals(plan.getFrequency()) && (plan.getCustomIntervalDays() == null || plan.getCustomIntervalDays() < 1)) throw new IllegalArgumentException("自定义间隔必须大于0天");
        OaIdentityReference person = OaRecordSupport.require(identities.user(plan.getResponsibleId(), OaRecordSupport.tenantId()), "负责人不存在或不属于当前租户");
        plan.setResponsibleName(person.getName()); OaRecordSupport.require(plan.getNextDueDate(), "下次维保日期不能为空");
        if (plan.getSupplierId() != null) suppliers.assertSupplierAllowed(plan.getSupplierId(), "PURCHASE");
        plan.setStatus(OaRecordSupport.code(plan.getStatus(), "ACTIVE", Set.of("ACTIVE", "DISABLED")));
        plan.setReminderDays(plan.getReminderDays() == null ? 7 : plan.getReminderDays());
        if (plan.getReminderDays() < 0) throw new IllegalArgumentException("提醒天数不能为负数");
        if (plan.getPlanId() == null) { OaRecordSupport.create(plan, "planId"); plan.setLastCompletedDate(null); OaRecordSupport.saved(planMapper.insert(plan)); }
        else {
            OaAssetMaintenancePlan previous = OaRecordSupport.active(planMapper.selectForUpdate(plan.getPlanId(), OaRecordSupport.tenantId()));
            OaRecordSupport.same(previous.getAssetId(), plan.getAssetId(), "维保计划不能更换资产"); OaRecordSupport.update(plan, previous);
            plan.setLastCompletedDate(previous.getLastCompletedDate()); OaRecordSupport.saved(planMapper.updateById(plan));
        }
        return plan.getPlanId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "生成资产维保任务")
    public int generateTasks() {
        int count = 0;
        List<OaAssetMaintenancePlan> plans = planMapper.selectList(new LambdaQueryWrapper<OaAssetMaintenancePlan>().eq(OaAssetMaintenancePlan::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetMaintenancePlan::getDeleted, 0).eq(OaAssetMaintenancePlan::getStatus, "ACTIVE"));
        for (OaAssetMaintenancePlan candidate : plans) {
            SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(candidate.getAssetId(), OaRecordSupport.tenantId()));
            if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) continue;
            OaAssetMaintenancePlan plan = OaRecordSupport.active(planMapper.selectForUpdate(candidate.getPlanId(), OaRecordSupport.tenantId()));
            if (plan.getNextDueDate().isAfter(LocalDate.now().plusDays(plan.getReminderDays()))) continue;
            OaAssetMaintenanceTask task = taskMapper.selectOne(new LambdaQueryWrapper<OaAssetMaintenanceTask>().eq(OaAssetMaintenanceTask::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaAssetMaintenanceTask::getPlanId, plan.getPlanId()).eq(OaAssetMaintenanceTask::getPlannedDate, plan.getNextDueDate()));
            if (task == null) {
                task = new OaAssetMaintenanceTask(); OaRecordSupport.create(task, "taskId"); task.setPlanId(plan.getPlanId()); task.setAssetId(plan.getAssetId());
                task.setPlannedDate(plan.getNextDueDate()); task.setStatus("PENDING"); task.setCost(java.math.BigDecimal.ZERO); OaRecordSupport.saved(taskMapper.insert(task)); count++;
            }
            if ("PENDING".equals(task.getStatus())) reminders.send(plan.getResponsibleId(), "ASSET_MAINTENANCE", task.getTaskId().toString(), plan.getNextDueDate().toString(), "资产维保到期提醒", asset.getName() + "：" + plan.getPlanName() + "，到期日" + plan.getNextDueDate());
        }
        return count;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "完成资产维保任务", spel = "#request.taskId")
    public void completeTask(OaAssetMaintenanceTask request) {
        OaAssetMaintenanceTask reference = OaRecordSupport.active(taskMapper.selectById(request.getTaskId()));
        OaRecordSupport.active(assetMapper.selectForUpdate(reference.getAssetId(), OaRecordSupport.tenantId()));
        OaAssetMaintenancePlan plan = OaRecordSupport.active(planMapper.selectForUpdate(reference.getPlanId(), OaRecordSupport.tenantId()));
        OaAssetMaintenanceTask task = OaRecordSupport.active(taskMapper.selectForUpdate(reference.getTaskId(), OaRecordSupport.tenantId()));
        if (!"PENDING".equals(task.getStatus())) return;
        task.setResult(OaRecordSupport.code(request.getResult(), null, Set.of("NORMAL", "ABNORMAL", "NEED_REPAIR")));
        task.setActualDate(request.getActualDate() == null ? LocalDate.now() : request.getActualDate());
        if (task.getActualDate().isAfter(LocalDate.now())) throw new IllegalArgumentException("实际完成日不能在未来");
        task.setCost(OaRecordSupport.decimal(OaRecordSupport.zero(request.getCost()), 10, 2, false, "维保费用"));
        task.setDescription(request.getDescription()); task.setAttachmentUrl(request.getAttachmentUrl()); task.setExecutorId(UserContext.getUserId()); task.setExecutorName(OaRecordSupport.userName());
        task.setStatus("COMPLETED"); OaRecordSupport.touch(task); OaRecordSupport.saved(taskMapper.updateById(task));
        plan.setLastCompletedDate(task.getActualDate());
        LocalDate next = switch (plan.getFrequency()) { case "MONTHLY" -> task.getPlannedDate().plusMonths(1); case "QUARTERLY" -> task.getPlannedDate().plusMonths(3); case "HALF_YEARLY" -> task.getPlannedDate().plusMonths(6); case "YEARLY" -> task.getPlannedDate().plusYears(1); default -> task.getPlannedDate().plusDays(plan.getCustomIntervalDays()); };
        plan.setNextDueDate(next); OaRecordSupport.touch(plan); OaRecordSupport.saved(planMapper.updateById(plan));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "资产保险与保修到期扫描")
    public int scanExpiry() {
        int count = 0;
        for (SysAsset asset : assetMapper.selectList(new LambdaQueryWrapper<SysAsset>().eq(SysAsset::getTenantId, OaRecordSupport.tenantId()).eq(SysAsset::getDeleted, 0)
                .notIn(SysAsset::getStatus, "SCRAPPED", "DISPOSED", "LOST"))) {
            int warrantyDays = config.getConfigInt("sys.oa.asset.warrantyReminderDays", 30);
            boolean insuranceDue = asset.getInsuranceEndDate() != null && !asset.getInsuranceEndDate().isAfter(LocalDate.now().plusDays(asset.getInsuranceReminderDays()));
            boolean warrantyDue = asset.getWarrantyExpireDate() != null && !asset.getWarrantyExpireDate().isAfter(LocalDate.now().plusDays(warrantyDays));
            if (!insuranceDue && !warrantyDue) continue;
            Long recipient = asset.getCustodianId() != null ? asset.getCustodianId() : config.getConfigLong("sys.oa.asset.reminderUserId", 1L);
            OaRecordSupport.require(identities.user(recipient, OaRecordSupport.tenantId()), "资产提醒接收人不属于当前租户，请配置管理人");
            if (insuranceDue) {
                reminders.send(recipient, "ASSET_INSURANCE", asset.getAssetId().toString(), asset.getInsuranceEndDate().toString(), "资产保险到期提醒", asset.getName() + "保险于" + asset.getInsuranceEndDate() + "到期"); count++;
            }
            if (warrantyDue) {
                reminders.send(recipient, "ASSET_WARRANTY", asset.getAssetId().toString(), asset.getWarrantyExpireDate().toString(), "资产保修到期提醒", asset.getName() + "保修于" + asset.getWarrantyExpireDate() + "到期"); count++;
            }
        }
        return count;
    }
}

package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaAssetDepreciationSchedule;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.mapper.OaAssetDepreciationScheduleMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaDepreciationService {
    private static final int PLAN_BATCH_SIZE = 400;
    private final SysAssetMapper assetMapper;
    private final OaAssetDepreciationScheduleMapper scheduleMapper;
    private final PlatformTransactionManager transactionManager;
    private final ObjectMapper objectMapper;
    private final OaAssetAuditService audit;

    private record PlannedPeriod(Long scheduleId, Integer version, Integer periodNo, String periodDate,
                                 BigDecimal depreciationAmount, BigDecimal accumulatedAmount, BigDecimal netValue, String status) { }

    public List<OaAssetDepreciationSchedule> schedules(Long assetId) {
        OaRecordSupport.active(assetMapper.selectById(assetId));
        return selectSchedules(assetId);
    }

    private List<OaAssetDepreciationSchedule> selectSchedules(Long assetId) {
        return scheduleMapper.selectList(new LambdaQueryWrapper<OaAssetDepreciationSchedule>().eq(OaAssetDepreciationSchedule::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetDepreciationSchedule::getAssetId, assetId).orderByAsc(OaAssetDepreciationSchedule::getPeriodNo));
    }

    private List<OaAssetDepreciationSchedule> planningSchedules(Long assetId) {
        return scheduleMapper.selectList(new LambdaQueryWrapper<OaAssetDepreciationSchedule>()
                .select(OaAssetDepreciationSchedule::getScheduleId, OaAssetDepreciationSchedule::getVersion,
                        OaAssetDepreciationSchedule::getPeriodNo, OaAssetDepreciationSchedule::getPeriodDate,
                        OaAssetDepreciationSchedule::getDepreciationAmount, OaAssetDepreciationSchedule::getAccumulatedAmount,
                        OaAssetDepreciationSchedule::getNetValue, OaAssetDepreciationSchedule::getStatus)
                .eq(OaAssetDepreciationSchedule::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetDepreciationSchedule::getAssetId, assetId).orderByAsc(OaAssetDepreciationSchedule::getPeriodNo));
    }

    public List<OaAssetDepreciationSchedule> preview(Long assetId) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectById(assetId));
        List<OaAssetDepreciationSchedule> existing = schedules(assetId);
        List<OaAssetDepreciationSchedule> planned = existing.stream().filter(row -> "PLANNED".equals(row.getStatus())).toList();
        return planned.isEmpty() ? OaDepreciationCalculator.generate(asset, existing.stream().filter(row -> "POSTED".equals(row.getStatus())).toList()) : planned;
    }

    @Transactional(rollbackFor = Exception.class)
    public void generatePlan(Long assetId) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(assetId, OaRecordSupport.tenantId()));
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("已终止使用的资产不能生成折旧");
        if (!Integer.valueOf(1).equals(asset.getDepreciationFlag())) throw new IllegalArgumentException("资产未启用折旧");
        List<OaAssetDepreciationSchedule> existing = planningSchedules(assetId);
        if (existing.stream().anyMatch(row -> "POSTED".equals(row.getStatus()))) return;
        OaAssetAuditService.Snapshot before = OaAssetAuditService.snapshot(asset);
        regenerate(asset, existing);
        audit.record(OaAssetAuditService.Action.PLAN_GENERATED, assetId, before, OaAssetAuditService.snapshot(asset));
    }

    private void regenerate(SysAsset asset, List<OaAssetDepreciationSchedule> existing) {
        List<OaAssetDepreciationSchedule> posted = existing.stream().filter(row -> "POSTED".equals(row.getStatus())).toList();
        List<OaAssetDepreciationSchedule> planned = OaDepreciationCalculator.generate(asset, posted);
        Map<Integer, OaAssetDepreciationSchedule> existingByPeriod = new HashMap<>();
        for (OaAssetDepreciationSchedule row : existing) existingByPeriod.put(row.getPeriodNo(), row);
        List<OaAssetDepreciationSchedule> inserted = new ArrayList<>();
        List<OaAssetDepreciationSchedule> updated = new ArrayList<>();
        Set<Integer> retained = planned.stream().map(OaAssetDepreciationSchedule::getPeriodNo).collect(java.util.stream.Collectors.toSet());
        for (OaAssetDepreciationSchedule row : planned) {
            OaAssetDepreciationSchedule previous = existingByPeriod.get(row.getPeriodNo());
            if (previous == null) inserted.add(row);
            else {
                if ("POSTED".equals(previous.getStatus())) throw new IllegalStateException("不能覆盖已过账折旧");
                if (samePlan(previous, row)) continue;
                row.setScheduleId(previous.getScheduleId()); row.setVersion(previous.getVersion()); updated.add(row);
            }
        }
        for (OaAssetDepreciationSchedule row : existing) if ("PLANNED".equals(row.getStatus()) && !retained.contains(row.getPeriodNo())) {
            row.setStatus("CANCELLED"); updated.add(row);
        }
        // 新期次只来自计算器；归属及审计值统一取已加锁资产和当前操作者。
        LocalDateTime createdAt = LocalDateTime.now();
        String createdBy = OaRecordSupport.userName();
        for (int from = 0; from < inserted.size(); from += PLAN_BATCH_SIZE) {
            List<OaAssetDepreciationSchedule> batch = inserted.subList(from, Math.min(from + PLAN_BATCH_SIZE, inserted.size()));
            int saved = scheduleMapper.insertPlanned(asset.getTenantId(), asset.getAssetId(), plannedJson(batch), createdBy, createdAt);
            if (saved != batch.size()) throw new IllegalStateException("记录已修改，请刷新后重试");
        }
        for (int from = 0; from < updated.size(); from += PLAN_BATCH_SIZE) {
            List<OaAssetDepreciationSchedule> batch = updated.subList(from, Math.min(from + PLAN_BATCH_SIZE, updated.size()));
            int saved = scheduleMapper.updateUnposted(asset.getTenantId(), asset.getAssetId(), plannedJson(batch), createdBy, createdAt);
            if (saved != batch.size()) throw new IllegalStateException("记录已修改，请刷新后重试");
        }
        BigDecimal accumulated = OaRecordSupport.zero(asset.getOpeningAccumulatedDepreciation()).add(posted.stream().map(OaAssetDepreciationSchedule::getDepreciationAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        asset.setAccumulatedDepreciation(accumulated); asset.setNetBookValue(asset.getPurchaseAmount().subtract(accumulated));
        asset.setDepreciationCompletedFlag(planned.isEmpty() ? 1 : 0);
        asset.setNextDepreciationDate(planned.isEmpty() ? null : planned.get(0).getPeriodDate()); OaRecordSupport.touch(asset);
        OaRecordSupport.saved(assetMapper.updateById(asset));
        if (planned.isEmpty()) assetMapper.update(null, new LambdaUpdateWrapper<SysAsset>().eq(SysAsset::getAssetId, asset.getAssetId()).set(SysAsset::getNextDepreciationDate, null));
    }

    private String plannedJson(List<OaAssetDepreciationSchedule> rows) {
        List<PlannedPeriod> periods = rows.stream().map(row -> new PlannedPeriod(row.getScheduleId(), row.getVersion(), row.getPeriodNo(), row.getPeriodDate().toString(),
                row.getDepreciationAmount(), row.getAccumulatedAmount(), row.getNetValue(), row.getStatus())).toList();
        try { return objectMapper.writeValueAsString(periods); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("资产折旧计划编码失败", exception); }
    }

    private boolean samePlan(OaAssetDepreciationSchedule previous, OaAssetDepreciationSchedule planned) {
        return Objects.equals(previous.getStatus(), planned.getStatus()) && Objects.equals(previous.getPeriodDate(), planned.getPeriodDate())
                && Objects.equals(previous.getDepreciationAmount(), planned.getDepreciationAmount())
                && Objects.equals(previous.getAccumulatedAmount(), planned.getAccumulatedAmount()) && Objects.equals(previous.getNetValue(), planned.getNetValue());
    }

    static void validateRepairAdjustment(SysAsset asset, BigDecimal capitalizedCost, Integer extensionMonths) {
        BigDecimal cost = OaRecordSupport.decimal(OaRecordSupport.zero(capitalizedCost), 10, 2, false, "维修费用");
        OaRecordSupport.decimal(OaRecordSupport.require(asset.getPurchaseAmount(), "资产原值未确定").add(cost), 10, 2, false, "资产原值");
        int extension = extensionMonths == null ? 0 : extensionMonths;
        if (extension < 0) throw new IllegalArgumentException("延长寿命不能为负数");
        if (extension > 0) {
            long revisedMonths = (long) OaRecordSupport.require(asset.getUsefulLifeMonths(), "资产使用寿命未设置") + extension;
            if (revisedMonths < 1 || revisedMonths > 1200) throw new IllegalArgumentException("延寿后使用寿命必须为1至1200个月");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void recalcAfterRepair(Long assetId, BigDecimal capitalizedCost, Integer extensionMonths) {
        recalcAfterRepair(assetId, capitalizedCost, extensionMonths, null, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public void recalcAfterRepair(Long assetId, BigDecimal capitalizedCost, Integer extensionMonths, Long repairId, ApprovalResultDTO decision) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(assetId, OaRecordSupport.tenantId()));
        if (Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) throw new IllegalArgumentException("该资产已终止使用");
        validateRepairAdjustment(asset, capitalizedCost, extensionMonths);
        OaAssetAuditService.Snapshot before = OaAssetAuditService.snapshot(asset);
        asset.setPurchaseAmount(OaRecordSupport.decimal(OaRecordSupport.require(asset.getPurchaseAmount(), "资产原值未确定").add(OaRecordSupport.zero(capitalizedCost)), 10, 2, false, "资产原值"));
        int extension = extensionMonths == null ? 0 : extensionMonths;
        if (extension < 0) throw new IllegalArgumentException("延长寿命不能为负数");
        if (extension > 0) asset.setUsefulLifeMonths(Math.addExact(OaRecordSupport.require(asset.getUsefulLifeMonths(), "资产使用寿命未设置"), extension));
        if (Integer.valueOf(1).equals(asset.getDepreciationFlag())) regenerate(asset, planningSchedules(assetId));
        else { asset.setNetBookValue(asset.getPurchaseAmount().subtract(OaRecordSupport.zero(asset.getAccumulatedDepreciation()))); OaRecordSupport.touch(asset); OaRecordSupport.saved(assetMapper.updateById(asset)); }
        audit.record(OaAssetAuditService.Action.REPAIR_ADJUSTED, repairId, before, OaAssetAuditService.snapshot(asset),
                Map.of("capitalizedCost", OaRecordSupport.zero(capitalizedCost), "extensionMonths", extension), decision);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "取消未过账折旧", highRisk = true, spel = "#assetId")
    public void cancelPending(Long assetId) {
        cancelPending(assetId, null);
    }

    @Transactional(rollbackFor = Exception.class)
    // 保留启动期高风险声明；实际记录由同一事务内的 audit.record 写入。
    @Audit(name = "取消未过账折旧", highRisk = true, spel = "#assetId")
    public void cancelPending(Long assetId, ApprovalResultDTO decision) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(assetId, OaRecordSupport.tenantId()));
        OaAssetAuditService.Snapshot before = OaAssetAuditService.snapshot(asset);
        int cancelled = scheduleMapper.update(null, new LambdaUpdateWrapper<OaAssetDepreciationSchedule>().eq(OaAssetDepreciationSchedule::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetDepreciationSchedule::getAssetId, assetId).eq(OaAssetDepreciationSchedule::getStatus, "PLANNED")
                .set(OaAssetDepreciationSchedule::getStatus, "CANCELLED").set(OaAssetDepreciationSchedule::getUpdateTime, LocalDateTime.now()).set(OaAssetDepreciationSchedule::getUpdateBy, OaRecordSupport.userName()));
        assetMapper.update(null, new LambdaUpdateWrapper<SysAsset>().eq(SysAsset::getAssetId, assetId).set(SysAsset::getNextDepreciationDate, null));
        asset.setNextDepreciationDate(null);
        if (cancelled > 0 || before.asset().nextDepreciationDate() != null) {
            audit.record(OaAssetAuditService.Action.DEPRECIATION_CANCELLED, assetId, before, OaAssetAuditService.snapshot(asset),
                    Map.of("cancelledPeriods", cancelled), decision);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public int postDueAsset(Long assetId, LocalDate date) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(assetId, OaRecordSupport.tenantId()));
        if (!Integer.valueOf(1).equals(asset.getDepreciationFlag()) || Set.of("SCRAPPED", "DISPOSED", "LOST").contains(asset.getStatus())) return 0;
        OaAssetAuditService.Snapshot before = OaAssetAuditService.snapshot(asset);
        List<OaAssetDepreciationSchedule> all = schedules(assetId); int count = 0;
        BigDecimal accumulated = OaRecordSupport.zero(asset.getOpeningAccumulatedDepreciation()).add(all.stream().filter(row -> "POSTED".equals(row.getStatus())).map(OaAssetDepreciationSchedule::getDepreciationAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal depreciable = asset.getPurchaseAmount().subtract(OaRecordSupport.zero(asset.getSalvageValue()));
        if (accumulated.compareTo(depreciable) > 0) throw new IllegalStateException("折旧计划超过可折旧总额，请重新预览核对");
        int cancelled = 0;
        for (OaAssetDepreciationSchedule row : all) {
            if (!"PLANNED".equals(row.getStatus())) continue;
            if (accumulated.compareTo(depreciable) == 0) {
                row.setStatus("CANCELLED"); OaRecordSupport.touch(row); OaRecordSupport.saved(scheduleMapper.updateById(row));
                cancelled++;
                continue;
            }
            if (row.getPeriodDate().isAfter(date)) continue;
            accumulated = accumulated.add(row.getDepreciationAmount());
            if (accumulated.compareTo(depreciable) > 0) throw new IllegalStateException("折旧计划超过可折旧总额，请重新预览核对");
            row.setAccumulatedAmount(accumulated); row.setNetValue(asset.getPurchaseAmount().subtract(accumulated)); row.setStatus("POSTED"); row.setPostTime(LocalDateTime.now()); row.setPostBy(UserContext.getUserId());
            OaRecordSupport.touch(row); OaRecordSupport.saved(scheduleMapper.updateById(row)); count++;
        }
        boolean completed = accumulated.compareTo(depreciable) == 0;
        if (count == 0 && cancelled == 0 && (!completed || Integer.valueOf(1).equals(asset.getDepreciationCompletedFlag()) && asset.getNextDepreciationDate() == null)) return 0;
        LocalDate next = all.stream().filter(row -> "PLANNED".equals(row.getStatus())).map(OaAssetDepreciationSchedule::getPeriodDate).min(LocalDate::compareTo).orElse(null);
        asset.setAccumulatedDepreciation(accumulated); asset.setNetBookValue(asset.getPurchaseAmount().subtract(accumulated));
        asset.setNextDepreciationDate(next); asset.setDepreciationCompletedFlag(completed || next == null ? 1 : 0); OaRecordSupport.touch(asset); OaRecordSupport.saved(assetMapper.updateById(asset));
        if (next == null) OaRecordSupport.saved(assetMapper.update(null, new LambdaUpdateWrapper<SysAsset>().eq(SysAsset::getAssetId, assetId)
                .eq(SysAsset::getTenantId, OaRecordSupport.tenantId()).set(SysAsset::getNextDepreciationDate, null)));
        audit.record(OaAssetAuditService.Action.DEPRECIATION_POSTED, assetId, before, OaAssetAuditService.snapshot(asset),
                Map.of("dueThrough", date.toString(), "postedPeriods", count, "cancelledPeriods", cancelled), null);
        return count;
    }

    public int postDue() {
        List<SysAsset> assets = assetMapper.selectList(new LambdaQueryWrapper<SysAsset>().eq(SysAsset::getTenantId, OaRecordSupport.tenantId())
                .eq(SysAsset::getDeleted, 0).eq(SysAsset::getDepreciationFlag, 1).eq(SysAsset::getDepreciationCompletedFlag, 0).le(SysAsset::getNextDepreciationDate, LocalDate.now()));
        int total = 0;
        for (SysAsset asset : assets) total += new TransactionTemplate(transactionManager).execute(status -> postDueAsset(asset.getAssetId(), LocalDate.now()));
        return total;
    }
}

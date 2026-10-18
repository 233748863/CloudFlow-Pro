package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaAssetCategory;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.mapper.OaAssetCategoryMapper;
import com.cloudflow.oa.mapper.OaAssetDepreciationScheduleMapper;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.cloudflow.oa.domain.OaAssetDepreciationSchedule;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaAssetRegistryService {
    private final SysAssetMapper assetMapper;
    private final OaAssetCategoryMapper categoryMapper;
    private final OaAssetDepreciationScheduleMapper scheduleMapper;
    private final OaDepreciationService depreciation;

    public SysAsset detail(Long id) { return OaRecordSupport.active(assetMapper.selectById(id)); }

    public PageResult<SysAsset> list(SysAsset query, PageQuery page) {
        return PageResult.build(assetMapper.selectPage(page.build(), new LambdaQueryWrapper<SysAsset>()
                .eq(SysAsset::getTenantId, OaRecordSupport.tenantId()).eq(SysAsset::getDeleted, 0)
                .like(StringUtils.hasText(query.getName()), SysAsset::getName, query.getName())
                .like(StringUtils.hasText(query.getAssetCode()), SysAsset::getAssetCode, query.getAssetCode())
                .eq(query.getCategoryId() != null, SysAsset::getCategoryId, query.getCategoryId())
                .eq(StringUtils.hasText(query.getStatus()), SysAsset::getStatus, query.getStatus()).orderByDesc(SysAsset::getAssetId)));
    }

    public List<OaAssetCategory> categories() {
        return categoryMapper.selectList(new LambdaQueryWrapper<OaAssetCategory>().eq(OaAssetCategory::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetCategory::getDeleted, 0).orderByAsc(OaAssetCategory::getSortNo, OaAssetCategory::getCategoryId));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存资产分类", spel = "#category")
    public Long saveCategory(OaAssetCategory category) {
        category.setCategoryCode(OaRecordSupport.text(category.getCategoryCode(), 50, "分类编码"));
        category.setCategoryName(OaRecordSupport.text(category.getCategoryName(), 100, "分类名称"));
        category.setStatus(OaRecordSupport.code(category.getStatus(), "ACTIVE", Set.of("ACTIVE", "DISABLED")));
        category.setDefaultDepreciationMethod(OaRecordSupport.code(category.getDefaultDepreciationMethod(), "STRAIGHT_LINE", Set.of("STRAIGHT_LINE", "DOUBLE_DECLINING", "SUM_OF_YEARS")));
        category.setDefaultSalvageRate(OaRecordSupport.decimal(OaRecordSupport.zero(category.getDefaultSalvageRate()), 6, 4, false, "残值率"));
        if (category.getDefaultSalvageRate().compareTo(BigDecimal.ONE) > 0) throw new IllegalArgumentException("残值率不能超过1");
        if (category.getDefaultUsefulLifeMonths() != null && (category.getDefaultUsefulLifeMonths() < 1 || category.getDefaultUsefulLifeMonths() > 1200)) throw new IllegalArgumentException("默认寿命必须为1至1200个月");
        category.setMaintenanceRequiredFlag(OaRecordSupport.flag(category.getMaintenanceRequiredFlag()));
        category.setParentId(category.getParentId() == null ? 0L : category.getParentId()); category.setSortNo(category.getSortNo() == null ? 0 : category.getSortNo());
        String prefix = "/";
        if (category.getParentId() != 0) {
            OaAssetCategory parent = OaRecordSupport.active(categoryMapper.selectForUpdate(category.getParentId(), OaRecordSupport.tenantId()));
            if (Objects.equals(parent.getCategoryId(), category.getCategoryId()) || category.getCategoryId() != null && parent.getLevelPath().contains("/" + category.getCategoryId() + "/")) throw new IllegalArgumentException("分类存在循环引用");
            prefix = parent.getLevelPath();
        }
        OaAssetCategory previous = category.getCategoryId() == null ? null : OaRecordSupport.active(categoryMapper.selectForUpdate(category.getCategoryId(), OaRecordSupport.tenantId()));
        if (previous == null) { OaRecordSupport.create(category, "categoryId"); category.setLevelPath(prefix); OaRecordSupport.saved(categoryMapper.insert(category)); }
        else OaRecordSupport.update(category, previous);
        String newPath = prefix + category.getCategoryId() + "/";
        if (newPath.length() > 500) throw new IllegalArgumentException("分类路径过长");
        category.setLevelPath(newPath); OaRecordSupport.saved(categoryMapper.updateById(category));
        if (previous != null && !Objects.equals(previous.getLevelPath(), newPath)) for (OaAssetCategory child : categories()) {
            if (!child.getCategoryId().equals(category.getCategoryId()) && child.getLevelPath().startsWith(previous.getLevelPath())) {
                String path = newPath + child.getLevelPath().substring(previous.getLevelPath().length());
                if (path.length() > 500) throw new IllegalArgumentException("子分类路径过长");
                child.setLevelPath(path); OaRecordSupport.touch(child); OaRecordSupport.saved(categoryMapper.updateById(child));
            }
        }
        return category.getCategoryId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除资产分类", highRisk = true, spel = "#id")
    public void removeCategory(Long id) {
        OaAssetCategory category = OaRecordSupport.active(categoryMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (categoryMapper.selectCount(new LambdaQueryWrapper<OaAssetCategory>().eq(OaAssetCategory::getParentId, id).eq(OaAssetCategory::getDeleted, 0)) > 0
                || assetMapper.selectCount(new LambdaQueryWrapper<SysAsset>().eq(SysAsset::getCategoryId, id).eq(SysAsset::getDeleted, 0)) > 0) throw new IllegalArgumentException("分类仍被引用");
        OaRecordSupport.touch(category);
        OaRecordSupport.saved(categoryMapper.update(null, new LambdaUpdateWrapper<OaAssetCategory>()
                .eq(OaAssetCategory::getCategoryId, id).eq(OaAssetCategory::getTenantId, OaRecordSupport.tenantId())
                .eq(OaAssetCategory::getDeleted, 0).eq(OaAssetCategory::getVersion, category.getVersion())
                .set(OaAssetCategory::getDeleted, 1).set(OaAssetCategory::getVersion, category.getVersion() + 1)
                .set(OaAssetCategory::getUpdateBy, category.getUpdateBy()).set(OaAssetCategory::getUpdateTime, category.getUpdateTime())));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存资产主数据", spel = "#asset")
    public Long saveAsset(SysAsset asset) {
        asset.setName(OaRecordSupport.text(asset.getName(), 100, "资产名称"));
        asset.setAssetCode(OaRecordSupport.text(asset.getAssetCode(), 50, "资产编码"));
        OaAssetCategory category = OaRecordSupport.active(categoryMapper.selectById(OaRecordSupport.require(asset.getCategoryId(), "请选择资产分类")));
        if (!"ACTIVE".equals(category.getStatus())) throw new IllegalArgumentException("资产分类已停用");
        SysAsset previous = asset.getAssetId() == null ? null : OaRecordSupport.active(assetMapper.selectForUpdate(asset.getAssetId(), OaRecordSupport.tenantId()));
        if (asset.getPurchaseAmount() != null) asset.setPurchaseAmount(OaRecordSupport.decimal(asset.getPurchaseAmount(), 10, 2, false, "资产原值"));
        if (asset.getSalvageValue() == null) asset.setSalvageValue(asset.getPurchaseAmount() == null ? BigDecimal.ZERO : asset.getPurchaseAmount().multiply(category.getDefaultSalvageRate()).setScale(2, RoundingMode.HALF_UP));
        asset.setSalvageValue(OaRecordSupport.decimal(asset.getSalvageValue(), 10, 2, false, "残值"));
        asset.setOpeningAccumulatedDepreciation(OaRecordSupport.decimal(OaRecordSupport.zero(asset.getOpeningAccumulatedDepreciation()), 10, 2, false, "期初折旧"));
        asset.setDepreciationFlag(OaRecordSupport.flag(asset.getDepreciationFlag()));
        asset.setDepreciationMethod(OaRecordSupport.code(asset.getDepreciationMethod(), category.getDefaultDepreciationMethod(), Set.of("STRAIGHT_LINE", "DOUBLE_DECLINING", "SUM_OF_YEARS")));
        asset.setDepreciationFrequency(OaRecordSupport.code(asset.getDepreciationFrequency(), "MONTHLY", Set.of("MONTHLY", "QUARTERLY", "YEARLY")));
        if (asset.getUsefulLifeMonths() == null) asset.setUsefulLifeMonths(category.getDefaultUsefulLifeMonths());
        asset.setMaintenanceRequiredFlag(OaRecordSupport.flag(asset.getMaintenanceRequiredFlag() == null ? category.getMaintenanceRequiredFlag() : asset.getMaintenanceRequiredFlag()));
        asset.setInsuranceReminderDays(asset.getInsuranceReminderDays() == null ? 30 : asset.getInsuranceReminderDays());
        if (asset.getInsuranceReminderDays() < 0) throw new IllegalArgumentException("保险提醒天数不能为负数");
        if (asset.getInsuredValue() != null) asset.setInsuredValue(OaRecordSupport.decimal(asset.getInsuredValue(), 10, 2, false, "保险金额"));
        if (asset.getInsuranceStartDate() != null && asset.getInsuranceEndDate() != null && asset.getInsuranceStartDate().isAfter(asset.getInsuranceEndDate())) throw new IllegalArgumentException("保险日期区间无效");
        if (previous == null) {
            OaRecordSupport.create(asset, "assetId"); asset.setStatus("IDLE"); asset.setOwnerId(null); asset.setDisposalDate(null);
            asset.setAccumulatedDepreciation(asset.getOpeningAccumulatedDepreciation()); asset.setDepreciationCompletedFlag(0); asset.setNextDepreciationDate(null);
            asset.setNetBookValue(asset.getPurchaseAmount() == null ? null : asset.getPurchaseAmount().subtract(asset.getAccumulatedDepreciation()));
        } else {
            OaRecordSupport.update(asset, previous);
            asset.setStatus(previous.getStatus()); asset.setOwnerId(previous.getOwnerId()); asset.setDisposalDate(previous.getDisposalDate());
            asset.setCustodianId(previous.getCustodianId()); asset.setCustodianName(previous.getCustodianName()); asset.setDeptId(previous.getDeptId()); asset.setDeptName(previous.getDeptName());
            asset.setAccumulatedDepreciation(previous.getAccumulatedDepreciation()); asset.setDepreciationCompletedFlag(previous.getDepreciationCompletedFlag()); asset.setNextDepreciationDate(previous.getNextDepreciationDate());
            boolean hasHistory = scheduleMapper.selectCount(new LambdaQueryWrapper<OaAssetDepreciationSchedule>().eq(OaAssetDepreciationSchedule::getAssetId, asset.getAssetId()).eq(OaAssetDepreciationSchedule::getStatus, "POSTED")) > 0;
            if (hasHistory && (changed(asset.getPurchaseAmount(), previous.getPurchaseAmount()) || changed(asset.getSalvageValue(), previous.getSalvageValue())
                    || changed(asset.getOpeningAccumulatedDepreciation(), previous.getOpeningAccumulatedDepreciation()) || !Objects.equals(asset.getUsefulLifeMonths(), previous.getUsefulLifeMonths())
                    || !Objects.equals(asset.getAvailableFromDate(), previous.getAvailableFromDate()) || !Objects.equals(asset.getDepreciationMethod(), previous.getDepreciationMethod())
                    || !Objects.equals(asset.getDepreciationFrequency(), previous.getDepreciationFrequency()) || !Objects.equals(asset.getDepreciationFlag(), previous.getDepreciationFlag()))) throw new IllegalArgumentException("已有折旧历史，金额或寿命变更须走维修资本化及延寿");
            if (!hasHistory) asset.setAccumulatedDepreciation(asset.getOpeningAccumulatedDepreciation());
            asset.setNetBookValue(asset.getPurchaseAmount() == null ? null : asset.getPurchaseAmount().subtract(OaRecordSupport.zero(asset.getAccumulatedDepreciation())));
        }
        if (asset.getNetBookValue() != null && asset.getNetBookValue().compareTo(asset.getSalvageValue()) < 0) throw new IllegalArgumentException("资产净值不能小于残值");
        if (asset.getDepreciationFlag() == 1) OaDepreciationCalculator.generate(asset, previous == null ? List.of() : depreciation.schedules(asset.getAssetId()).stream().filter(row -> "POSTED".equals(row.getStatus())).toList());
        if (previous == null) OaRecordSupport.saved(assetMapper.insert(asset)); else OaRecordSupport.saved(assetMapper.updateById(asset));
        if (asset.getDepreciationFlag() == 1) depreciation.generatePlan(asset.getAssetId());
        else if (previous != null) depreciation.cancelPending(asset.getAssetId());
        return asset.getAssetId();
    }

    private boolean changed(BigDecimal left, BigDecimal right) { return left == null || right == null ? !Objects.equals(left, right) : left.compareTo(right) != 0; }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除资产", highRisk = true, spel = "#id")
    public void removeAsset(Long id) {
        SysAsset asset = OaRecordSupport.active(assetMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (!"IDLE".equals(asset.getStatus()) || scheduleMapper.selectCount(new LambdaQueryWrapper<OaAssetDepreciationSchedule>().eq(OaAssetDepreciationSchedule::getAssetId, id).eq(OaAssetDepreciationSchedule::getStatus, "POSTED")) > 0) throw new IllegalArgumentException("在用或已有折旧历史的资产不能删除");
        depreciation.cancelPending(id); OaRecordSupport.touch(asset);
        OaRecordSupport.saved(assetMapper.update(null, new LambdaUpdateWrapper<SysAsset>()
                .eq(SysAsset::getAssetId, id).eq(SysAsset::getTenantId, OaRecordSupport.tenantId())
                .eq(SysAsset::getDeleted, 0).eq(SysAsset::getVersion, asset.getVersion())
                .set(SysAsset::getDeleted, 1).set(SysAsset::getVersion, asset.getVersion() + 1)
                .set(SysAsset::getUpdateBy, asset.getUpdateBy()).set(SysAsset::getUpdateTime, asset.getUpdateTime())));
    }
}

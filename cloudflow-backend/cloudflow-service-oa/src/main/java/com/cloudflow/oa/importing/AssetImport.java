package com.cloudflow.oa.importing;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.excel.importing.ImportColumn;
import com.cloudflow.common.excel.importing.ImportContext;
import com.cloudflow.common.excel.importing.ImportDefinition;
import com.cloudflow.common.excel.importing.ImportError;
import com.cloudflow.common.excel.importing.ImportHandler;
import com.cloudflow.common.excel.importing.ImportKeys;
import com.cloudflow.common.excel.importing.ImportReference;
import com.cloudflow.oa.domain.OaAssetCategory;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.mapper.OaAssetCategoryMapper;
import com.cloudflow.oa.mapper.OaImportMapper;
import com.cloudflow.oa.service.impl.OaAssetRegistryService;
import com.cloudflow.oa.service.impl.OaDepreciationCalculator;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AssetImport implements ImportDefinition<SysAsset>, ImportHandler<SysAsset> {
    private final OaImportMapper imports;
    private final OaAssetCategoryMapper categories;
    private final OaAssetRegistryService service;

    @Override public String bizType() { return "ASSET"; }
    @Override public String bizName() { return "资产"; }
    @Override public String permission() { return "oa:asset:import"; }
    @Override public Class<SysAsset> rowClass() { return SysAsset.class; }
    @Override public List<List<String>> uniqueKeys() { return List.of(List.of("assetCode")); }

    @Override
    public List<ImportColumn> columns() {
        return List.of(
                ImportColumn.builder().field("assetCode").name("资产编码").required(true).maxLength(50).example("ASSET2026001").build(),
                ImportColumn.builder().field("name").name("资产名称").required(true).maxLength(100).example("办公电脑").build(),
                ImportColumn.builder().field("categoryId").name("资产分类").type(ImportColumn.Type.REFERENCE).reference("ASSET_CATEGORY").required(true).maxLength(100).example("办公设备").build(),
                ImportColumn.builder().field("model").name("规格型号").maxLength(100).example("标准办公配置").build(),
                money("purchaseAmount", "资产原值", "6000.00"),
                ImportColumn.builder().field("purchaseDate").name("采购日期").type(ImportColumn.Type.DATE).maxLength(10).example("2026-09-01").build(),
                ImportColumn.builder().field("location").name("存放位置").maxLength(100).example("总部办公区").build(),
                money("salvageValue", "残值", "300.00"),
                money("openingAccumulatedDepreciation", "期初累计折旧", "0.00"),
                ImportColumn.builder().field("depreciationFlag").name("计提折旧").options(Map.of("0", "否", "1", "是")).example("否").build(),
                ImportColumn.builder().field("usefulLifeMonths").name("使用寿命月数").type(ImportColumn.Type.INTEGER).minimum(BigDecimal.ONE).maximum(BigDecimal.valueOf(1200)).example("36").build(),
                ImportColumn.builder().field("availableFromDate").name("折旧起算日").type(ImportColumn.Type.DATE).maxLength(10).example("2026-09-01").build(),
                ImportColumn.builder().field("depreciationMethod").name("折旧方法").options(Map.of("STRAIGHT_LINE", "直线法", "DOUBLE_DECLINING", "双倍余额递减法", "SUM_OF_YEARS", "年数总和法")).example("直线法").build(),
                ImportColumn.builder().field("depreciationFrequency").name("折旧频率").options(Map.of("MONTHLY", "每月", "QUARTERLY", "每季度", "YEARLY", "每年")).example("每月").build(),
                ImportColumn.builder().field("remark").name("备注").maxLength(500).example("新增资产").build());
    }

    private ImportColumn money(String field, String name, String example) {
        return ImportColumn.builder().field(field).name(name).type(ImportColumn.Type.DECIMAL)
                .minimum(BigDecimal.ZERO).maximum(new BigDecimal("99999999.99")).pattern("[-+]?\\d+(?:\\.\\d{1,2})?").example(example).build();
    }

    @Override
    public void prepare(ImportContext context) {
        List<OaAssetCategory> active = categories.selectList(new LambdaQueryWrapper<OaAssetCategory>()
                .eq(OaAssetCategory::getTenantId, context.getTenantId()).eq(OaAssetCategory::getDeleted, 0).eq(OaAssetCategory::getStatus, "ACTIVE"));
        context.addReferences("ASSET_CATEGORY", active.stream().map(category -> new ImportReference(category.getCategoryCode(), category.getCategoryName(), category.getCategoryId())).toList());
        context.addReferences("ASSET_CATEGORY_DETAIL", active.stream().map(category -> new ImportReference(String.valueOf(category.getCategoryId()), category.getCategoryCode(), category)).toList());
    }

    @Override
    public Set<String> findExistingKeys(List<SysAsset> rows, ImportContext context) {
        return imports.existingAssets(context.getTenantId(), rows.stream().map(SysAsset::getAssetCode).toList()).stream()
                .map(code -> ImportKeys.forFields(uniqueKeys().get(0), code)).collect(Collectors.toSet());
    }

    @Override
    public List<ImportError> validateRow(SysAsset row, int rowNo, ImportContext context) {
        OaAssetCategory category = (OaAssetCategory) context.resolve("ASSET_CATEGORY_DETAIL", String.valueOf(row.getCategoryId()));
        SysAsset candidate = new SysAsset();
        BeanUtils.copyProperties(row, candidate);
        if (candidate.getSalvageValue() == null) candidate.setSalvageValue(candidate.getPurchaseAmount() == null ? BigDecimal.ZERO : candidate.getPurchaseAmount().multiply(category.getDefaultSalvageRate()).setScale(2, RoundingMode.HALF_UP));
        if (candidate.getOpeningAccumulatedDepreciation() == null) candidate.setOpeningAccumulatedDepreciation(BigDecimal.ZERO);
        if (candidate.getUsefulLifeMonths() == null) candidate.setUsefulLifeMonths(category.getDefaultUsefulLifeMonths());
        if (candidate.getDepreciationMethod() == null) candidate.setDepreciationMethod(category.getDefaultDepreciationMethod());
        if (candidate.getDepreciationFrequency() == null) candidate.setDepreciationFrequency("MONTHLY");
        if (candidate.getPurchaseAmount() != null && candidate.getPurchaseAmount().subtract(candidate.getOpeningAccumulatedDepreciation()).compareTo(candidate.getSalvageValue()) < 0) {
            return List.of(new ImportError(rowNo, "残值", String.valueOf(candidate.getSalvageValue()), "BUSINESS", "残值与期初累计折旧之和不能超过资产原值"));
        }
        if (Integer.valueOf(1).equals(candidate.getDepreciationFlag())) {
            try { OaDepreciationCalculator.generate(candidate, List.of()); }
            catch (IllegalArgumentException exception) { return List.of(new ImportError(rowNo, null, null, "BUSINESS", LogSanitizer.limit(exception.getMessage(), 1000))); }
        }
        return List.of();
    }

    @Override
    public void importRow(SysAsset row, int rowNo, ImportContext context) { service.saveAsset(row); }
}

package com.cloudflow.oa.service.impl;

import cn.hutool.extra.qrcode.QrCodeUtil;
import cn.hutool.extra.qrcode.QrConfig;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.OaAssetCategory;
import com.cloudflow.oa.domain.OaAssetRepair;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.cloudflow.oa.service.IAssetService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AssetServiceImpl extends ServiceImpl<SysAssetMapper, SysAsset> implements IAssetService {
    private final OaAssetRegistryService registry;
    private final OaAssetOperationsService operations;
    private final ObjectMapper objectMapper;

    @Override
    public void generateQrCode(Long assetId, OutputStream outputStream) {
        SysAsset asset = registry.detail(assetId);
        try {
            String content = objectMapper.writeValueAsString(Map.of("id", asset.getAssetId(), "code", asset.getAssetCode(), "name", asset.getName()));
            QrConfig config = new QrConfig(300, 300); config.setMargin(2); config.setErrorCorrection(ErrorCorrectionLevel.M);
            QrCodeUtil.generate(content, config, "png", outputStream);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) { throw new IllegalStateException("二维码数据生成失败", exception); }
    }

    @Override
    @Audit(name = "资产领用", spel = "#assetId")
    public void borrowAsset(Long assetId, Long userId) { operations.directMovement(assetId, "ISSUE", userId, "资产领用"); }

    @Override
    @Audit(name = "资产归还", spel = "#assetId")
    public void returnAsset(Long assetId) { operations.directMovement(assetId, "RETURN", null, "资产归还"); }

    @Override
    @Audit(name = "资产送修", spel = "#assetId")
    public void repairAsset(Long assetId, String remark) {
        OaAssetRepair repair = new OaAssetRepair(); repair.setAssetId(assetId); repair.setFailureDate(LocalDate.now());
        repair.setFaultDescription(remark == null || remark.isBlank() ? "资产送修" : remark); operations.saveRepair(repair);
    }

    @Override
    @Audit(name = "资产报废", highRisk = true, spel = "#assetId")
    public void scrapAsset(Long assetId, String remark) { operations.directMovement(assetId, "SCRAP", null, remark == null || remark.isBlank() ? "资产报废" : remark); }

    @Override
    public List<OaAssetCategory> getAllCategories() { return registry.categories(); }

    @Override
    public DynamicMapVO getStatistics() {
        List<SysAsset> assets = list(new LambdaQueryWrapper<SysAsset>().eq(SysAsset::getTenantId, OaRecordSupport.tenantId()).eq(SysAsset::getDeleted, 0));
        Map<Long,String> categories = registry.categories().stream().collect(Collectors.toMap(OaAssetCategory::getCategoryId, OaAssetCategory::getCategoryName));
        Map<String,Object> result = new LinkedHashMap<>(); result.put("total", assets.size());
        Map<String,Long> states = new LinkedHashMap<>();
        states.put("idle", assets.stream().filter(asset -> "IDLE".equals(asset.getStatus())).count());
        states.put("inUse", assets.stream().filter(asset -> "IN_USE".equals(asset.getStatus())).count());
        states.put("repair", assets.stream().filter(asset -> "MAINTENANCE".equals(asset.getStatus())).count());
        states.put("scrapped", assets.stream().filter(asset -> "SCRAPPED".equals(asset.getStatus())).count());
        result.put("statusCount", states);
        result.put("categoryCount", assets.stream().collect(Collectors.groupingBy(asset -> categories.getOrDefault(asset.getCategoryId(), "未分类"), Collectors.counting())));
        result.put("totalValue", assets.stream().filter(asset -> !Set.of("SCRAPPED","DISPOSED").contains(asset.getStatus())).map(asset -> OaRecordSupport.zero(asset.getPurchaseAmount())).reduce(BigDecimal.ZERO, BigDecimal::add));
        result.put("categoryValue", assets.stream().collect(Collectors.groupingBy(asset -> categories.getOrDefault(asset.getCategoryId(), "未分类"), Collectors.reducing(BigDecimal.ZERO, asset -> OaRecordSupport.zero(asset.getPurchaseAmount()), BigDecimal::add))));
        result.put("netBookValue", assets.stream().map(asset -> OaRecordSupport.zero(asset.getNetBookValue())).reduce(BigDecimal.ZERO, BigDecimal::add));
        result.put("accumulatedDepreciation", assets.stream().map(asset -> OaRecordSupport.zero(asset.getAccumulatedDepreciation())).reduce(BigDecimal.ZERO, BigDecimal::add));
        return DynamicMapVO.from(result);
    }
}

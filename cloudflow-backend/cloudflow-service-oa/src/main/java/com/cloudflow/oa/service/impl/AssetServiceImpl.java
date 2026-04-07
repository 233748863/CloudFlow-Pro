package com.cloudflow.oa.service.impl;

import cn.hutool.extra.qrcode.QrCodeUtil;
import java.time.LocalDateTime;
import cn.hutool.extra.qrcode.QrConfig;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.service.IAssetService;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.OutputStream;
import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AssetServiceImpl extends ServiceImpl<SysAssetMapper, SysAsset> implements IAssetService {
    
    @Autowired
    private SysAssetLogMapper assetLogMapper;

    @Override
    public void generateQrCode(Long assetId, OutputStream outputStream) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        
        // 二维码内容：JSON格式，包含关键信息
        String content = String.format("{\"id\":%d,\"code\":\"%s\",\"name\":\"%s\"}", 
            asset.getAssetId(), asset.getAssetCode(), asset.getName());
            
        QrConfig config = new QrConfig(300, 300);
        config.setMargin(2);
        config.setErrorCorrection(ErrorCorrectionLevel.M);
        QrCodeUtil.generate(content, config, "png", outputStream);
    }

    @Override
    @Audit(name = "资产领用", spel = "#assetId", oldVal = "@assetServiceImpl.getById(#assetId)")
    @Transactional(rollbackFor = Exception.class)
    public void borrowAsset(Long assetId, Long userId) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        if (!"1".equals(asset.getStatus())) {
            throw new ServiceException("该资产当前不可领用，当前状态不是闲置");
        }
        
        asset.setStatus("2"); // 在用
        asset.setOwnerId(userId);
        updateById(asset);
        
        // 记录资产领用日志
        saveAssetLog(assetId, "领用", userId, "资产领用：" + asset.getName());
    }

    @Override
    @Audit(name = "资产归还", spel = "#assetId", oldVal = "@assetServiceImpl.getById(#assetId)")
    @Transactional(rollbackFor = Exception.class)
    public void returnAsset(Long assetId) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        if (!"2".equals(asset.getStatus())) {
            throw new ServiceException("该资产当前不在使用中，无法归还");
        }
        
        Long previousOwnerId = asset.getOwnerId();
        
        // 显式更新为 NULL，避免 updateById 忽略空字段导致 ownerId 残留旧值
        update(new LambdaUpdateWrapper<SysAsset>()
            .eq(SysAsset::getAssetId, assetId)
            .set(SysAsset::getStatus, "1")
            .set(SysAsset::getOwnerId, null));
        
        // 记录资产归还日志
        saveAssetLog(assetId, "归还", previousOwnerId, "资产归还：" + asset.getName());
    }

    @Override
    @Audit(name = "资产送修", spel = "#assetId", oldVal = "@assetServiceImpl.getById(#assetId)")
    @Transactional(rollbackFor = Exception.class)
    public void repairAsset(Long assetId, String remark) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        if ("4".equals(asset.getStatus())) {
            throw new ServiceException("已报废的资产不能送修");
        }
        
        String previousStatus = asset.getStatus();
        asset.setStatus("3"); // 维修
        updateById(asset);
        
        // 记录送修日志
        String logRemark = "资产送修：" + asset.getName();
        if (remark != null && !remark.isEmpty()) {
            logRemark += "，原因：" + remark;
        }
        saveAssetLog(assetId, "送修", asset.getOwnerId(), logRemark);
    }

    @Override
    @Audit(name = "资产报废", spel = "#assetId", oldVal = "@assetServiceImpl.getById(#assetId)")
    @Transactional(rollbackFor = Exception.class)
    public void scrapAsset(Long assetId, String remark) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        if ("4".equals(asset.getStatus())) {
            throw new ServiceException("该资产已经报废");
        }
        
        // 报废时也要显式清空领用人，避免空字段未落库
        update(new LambdaUpdateWrapper<SysAsset>()
            .eq(SysAsset::getAssetId, assetId)
            .set(SysAsset::getStatus, "4")
            .set(SysAsset::getOwnerId, null));
        
        // 记录报废日志
        String logRemark = "资产报废：" + asset.getName();
        if (remark != null && !remark.isEmpty()) {
            logRemark += "，原因：" + remark;
        }
        saveAssetLog(assetId, "报废", null, logRemark);
    }

    @Override
    public Map<String, Object> getStatistics() {
        List<SysAsset> allAssets = list();
        Map<String, Object> stats = new HashMap<>();
        
        // 总数
        stats.put("total", allAssets.size());
        
        // 按状态统计数量
        Map<String, Long> statusCount = new HashMap<>();
        statusCount.put("idle", allAssets.stream().filter(a -> "1".equals(a.getStatus())).count());      // 闲置
        statusCount.put("inUse", allAssets.stream().filter(a -> "2".equals(a.getStatus())).count());     // 在用
        statusCount.put("repair", allAssets.stream().filter(a -> "3".equals(a.getStatus())).count());    // 维修
        statusCount.put("scrapped", allAssets.stream().filter(a -> "4".equals(a.getStatus())).count());  // 报废
        stats.put("statusCount", statusCount);
        
        // 按分类统计数量
        Map<String, Long> categoryCount = allAssets.stream()
            .filter(a -> a.getCategory() != null && !a.getCategory().isEmpty())
            .collect(Collectors.groupingBy(SysAsset::getCategory, Collectors.counting()));
        stats.put("categoryCount", categoryCount);
        
        // 总价值（排除报废资产）
        BigDecimal totalValue = allAssets.stream()
            .filter(a -> !"4".equals(a.getStatus()) && a.getPrice() != null)
            .map(SysAsset::getPrice)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        stats.put("totalValue", totalValue);
        
        // 按分类统计价值
        Map<String, BigDecimal> categoryValue = allAssets.stream()
            .filter(a -> a.getCategory() != null && !a.getCategory().isEmpty() && a.getPrice() != null)
            .collect(Collectors.groupingBy(
                SysAsset::getCategory,
                Collectors.reducing(BigDecimal.ZERO, SysAsset::getPrice, BigDecimal::add)
            ));
        stats.put("categoryValue", categoryValue);
        
        return stats;
    }

    @Override
    public List<String> getAllCategories() {
        // 查询所有不重复的分类
        List<SysAsset> assets = list(new LambdaQueryWrapper<SysAsset>()
            .select(SysAsset::getCategory)
            .isNotNull(SysAsset::getCategory)
            .ne(SysAsset::getCategory, "")
            .groupBy(SysAsset::getCategory));
        return assets.stream()
            .map(SysAsset::getCategory)
            .distinct()
            .collect(Collectors.toList());
    }

    /**
     * 统一记录资产变动日志
     */
    private void saveAssetLog(Long assetId, String type, Long targetId, String remark) {
        try {
            SysAssetLog assetLog = new SysAssetLog();
            assetLog.setRefId(assetId);
            assetLog.setRefType("1"); // 1:固定资产
            assetLog.setType(type);
            assetLog.setQuantityChange(0); // 固定资产数量不变
            assetLog.setOperatorId(SecurityUtils.getUserId());
            assetLog.setTargetId(targetId);
            assetLog.setRemark(remark);
            assetLog.setCreateTime(LocalDateTime.now());
            assetLogMapper.insert(assetLog);
            log.debug("资产{}日志记录成功，资产ID: {}", type, assetId);
        } catch (Exception e) {
            log.error("记录资产{}日志失败", type, e);
            // 日志记录失败不影响主流程
        }
    }
}

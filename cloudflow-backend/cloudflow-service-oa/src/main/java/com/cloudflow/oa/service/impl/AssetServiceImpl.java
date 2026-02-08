package com.cloudflow.oa.service.impl;

import cn.hutool.extra.qrcode.QrCodeUtil;
import cn.hutool.extra.qrcode.QrConfig;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.utils.SecurityUtils;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.domain.SysAssetLog;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.cloudflow.oa.mapper.SysAssetLogMapper;
import com.cloudflow.oa.service.IAssetService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.OutputStream;
import java.util.Date;

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
        
        // 二维码内容：JSON格式或URL
        // 这里使用简单的JSON格式，包含关键信息
        String content = String.format("{\"id\":%d,\"code\":\"%s\",\"name\":\"%s\"}", 
            asset.getAssetId(), asset.getAssetCode(), asset.getName());
            
        QrConfig config = new QrConfig(300, 300);
        // 设置边距，既白边
        config.setMargin(2);
        QrCodeUtil.generate(content, config, "png", outputStream);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void borrowAsset(Long assetId, Long userId) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        if (!"1".equals(asset.getStatus())) {
            throw new ServiceException("该资产当前不可领用");
        }
        
        asset.setStatus("2"); // 在用
        asset.setOwnerId(userId);
        updateById(asset);
        
        // 记录资产领用日志
        try {
            SysAssetLog assetLog = new SysAssetLog();
            assetLog.setRefId(assetId);
            assetLog.setRefType("1"); // 1:固定资产
            assetLog.setType("领用");
            assetLog.setQuantityChange(0); // 固定资产数量不变
            assetLog.setOperatorId(SecurityUtils.getUserId());
            assetLog.setTargetId(userId);
            assetLog.setRemark("资产领用：" + asset.getName());
            assetLog.setCreateTime(new Date());
            assetLogMapper.insert(assetLog);
            log.debug("资产领用日志记录成功，资产ID: {}, 领用人ID: {}", assetId, userId);
        } catch (Exception e) {
            log.error("记录资产领用日志失败", e);
            // 日志记录失败不影响主流程
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void returnAsset(Long assetId) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        
        Long previousOwnerId = asset.getOwnerId();
        
        asset.setStatus("1"); // 闲置
        asset.setOwnerId(null);
        updateById(asset);
        
        // 记录资产归还日志
        try {
            SysAssetLog assetLog = new SysAssetLog();
            assetLog.setRefId(assetId);
            assetLog.setRefType("1"); // 1:固定资产
            assetLog.setType("归还");
            assetLog.setQuantityChange(0); // 固定资产数量不变
            assetLog.setOperatorId(SecurityUtils.getUserId());
            assetLog.setTargetId(previousOwnerId);
            assetLog.setRemark("资产归还：" + asset.getName());
            assetLog.setCreateTime(new Date());
            assetLogMapper.insert(assetLog);
            log.debug("资产归还日志记录成功，资产ID: {}, 归还人ID: {}", assetId, previousOwnerId);
        } catch (Exception e) {
            log.error("记录资产归还日志失败", e);
            // 日志记录失败不影响主流程
        }
    }
}

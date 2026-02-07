package com.cloudflow.oa.service.impl;

import cn.hutool.extra.qrcode.QrCodeUtil;
import cn.hutool.extra.qrcode.QrConfig;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.SysAsset;
import com.cloudflow.oa.mapper.SysAssetMapper;
import com.cloudflow.oa.service.IAssetService;
import org.springframework.stereotype.Service;

import java.io.OutputStream;

@Service
public class AssetServiceImpl extends ServiceImpl<SysAssetMapper, SysAsset> implements IAssetService {

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
        
        // TODO: 记录日志 sys_asset_log
    }

    @Override
    public void returnAsset(Long assetId) {
        SysAsset asset = getById(assetId);
        if (asset == null) {
            throw new ServiceException("资产不存在");
        }
        
        asset.setStatus("1"); // 闲置
        asset.setOwnerId(null);
        updateById(asset);
        
        // TODO: 记录日志 sys_asset_log
    }
}

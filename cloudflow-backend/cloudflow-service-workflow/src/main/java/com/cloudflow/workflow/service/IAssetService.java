package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.workflow.domain.SysAsset;
import java.io.OutputStream;

public interface IAssetService extends IService<SysAsset> {
    
    /**
     * 生成资产二维码
     */
    void generateQrCode(Long assetId, OutputStream outputStream);
    
    /**
     * 资产领用
     */
    void borrowAsset(Long assetId, Long userId);
    
    /**
     * 资产归还
     */
    void returnAsset(Long assetId);
}

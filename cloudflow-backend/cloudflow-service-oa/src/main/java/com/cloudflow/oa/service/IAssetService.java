package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysAsset;

import java.io.OutputStream;
import java.util.List;
import java.util.Map;

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

    /**
     * 资产送修
     */
    void repairAsset(Long assetId, String remark);

    /**
     * 资产报废
     */
    void scrapAsset(Long assetId, String remark);

    /**
     * 资产统计（按状态、分类、总价值等）
     */
    Map<String, Object> getStatistics();

    /**
     * 获取所有分类列表
     */
    List<String> getAllCategories();
}

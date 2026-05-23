package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaContractAmountThreshold;

import java.math.BigDecimal;
import java.util.List;

/**
 * OA-P0-3 合同金额阈值服务接口。
 */
public interface IOaContractAmountThresholdService {

    Page<OaContractAmountThreshold> page(String keyword, String businessUnit, String amountTier,
                                         String status, Integer pageNum, Integer pageSize);

    List<OaContractAmountThreshold> listActive();

    OaContractAmountThreshold getById(Long id);

    boolean save(OaContractAmountThreshold threshold);

    boolean update(OaContractAmountThreshold threshold);

    boolean remove(Long id);

    /**
     * 按 (businessUnit, amount) 命中规则:
     * 1) 精确匹配 business_unit
     * 2) 否则匹配 business_unit IS NULL 的通用规则
     * 在命中的规则中按 threshold_min DESC 取第一条(最高匹配档位)。
     */
    OaContractAmountThreshold matchThreshold(String businessUnit, BigDecimal amount);
}

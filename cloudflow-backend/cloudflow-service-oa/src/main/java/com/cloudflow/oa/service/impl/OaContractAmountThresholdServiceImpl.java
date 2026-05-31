package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaContractAmountThreshold;
import com.cloudflow.oa.mapper.OaContractAmountThresholdMapper;
import com.cloudflow.oa.service.IOaContractAmountThresholdService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

/**
 * OA-P0-3 合同金额阈值服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaContractAmountThresholdServiceImpl implements IOaContractAmountThresholdService {

    private static final Long DEFAULT_TENANT_ID = 100000L;

    private final OaContractAmountThresholdMapper thresholdMapper;

    @Override
    public Page<OaContractAmountThreshold> page(String keyword, String businessUnit, String amountTier,
                                                String status, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaContractAmountThreshold> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractAmountThreshold::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.like(OaContractAmountThreshold::getRemark, keyword);
        }
        if (StringUtils.hasText(businessUnit)) {
            wrapper.eq(OaContractAmountThreshold::getBusinessUnit, businessUnit);
        }
        if (StringUtils.hasText(amountTier)) {
            wrapper.eq(OaContractAmountThreshold::getAmountTier, amountTier);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaContractAmountThreshold::getStatus, status);
        }
        wrapper.orderByAsc(OaContractAmountThreshold::getThresholdMin);
        return thresholdMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<OaContractAmountThreshold> listActive() {
        LambdaQueryWrapper<OaContractAmountThreshold> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractAmountThreshold::getDeleted, 0)
                .eq(OaContractAmountThreshold::getStatus, "ACTIVE")
                .orderByAsc(OaContractAmountThreshold::getThresholdMin);
        return thresholdMapper.selectList(wrapper);
    }

    @Override
    public OaContractAmountThreshold getById(Long id) {
        return id == null ? null : thresholdMapper.selectById(id);
    }

    @Override
    @Transactional
    public boolean save(OaContractAmountThreshold threshold) {
        validate(threshold);
        if (threshold.getTenantId() == null) {
            threshold.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(threshold.getStatus())) {
            threshold.setStatus("ACTIVE");
        }
        threshold.setCreateBy(UserContext.getUserName());
        threshold.setUpdateBy(UserContext.getUserName());
        return thresholdMapper.insert(threshold) > 0;
    }

    @Override
    @Transactional
    @Audit(name = "更新合同金额阈值")
    public boolean update(OaContractAmountThreshold threshold) {
        if (threshold == null || threshold.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        validate(threshold);
        threshold.setUpdateBy(UserContext.getUserName());
        threshold.setUpdateTime(LocalDateTime.now());
        return thresholdMapper.updateById(threshold) > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long id) {
        if (id == null) {
            return false;
        }
        OaContractAmountThreshold t = new OaContractAmountThreshold();
        t.setId(id);
        t.setDeleted(1);
        t.setUpdateBy(UserContext.getUserName());
        t.setUpdateTime(LocalDateTime.now());
        return thresholdMapper.updateById(t) > 0;
    }

    @Override
    public OaContractAmountThreshold matchThreshold(String businessUnit, BigDecimal amount) {
        if (amount == null) {
            return null;
        }
        Long tenantId = UserContext.getTenantId() == null ? DEFAULT_TENANT_ID : UserContext.getTenantId();
        // 1) 精确匹配 business_unit
        if (StringUtils.hasText(businessUnit)) {
            OaContractAmountThreshold hit = matchInternal(tenantId, businessUnit, amount);
            if (hit != null) {
                return hit;
            }
        }
        // 2) 通用规则 (business_unit IS NULL)
        return matchInternal(tenantId, null, amount);
    }

    private OaContractAmountThreshold matchInternal(Long tenantId, String businessUnit, BigDecimal amount) {
        LambdaQueryWrapper<OaContractAmountThreshold> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractAmountThreshold::getDeleted, 0)
                .eq(OaContractAmountThreshold::getStatus, "ACTIVE")
                .eq(OaContractAmountThreshold::getTenantId, tenantId);
        if (businessUnit == null) {
            wrapper.isNull(OaContractAmountThreshold::getBusinessUnit);
        } else {
            wrapper.eq(OaContractAmountThreshold::getBusinessUnit, businessUnit);
        }
        wrapper.le(OaContractAmountThreshold::getThresholdMin, amount);
        wrapper.orderByDesc(OaContractAmountThreshold::getThresholdMin);
        List<OaContractAmountThreshold> list = thresholdMapper.selectList(wrapper);
        if (list == null || list.isEmpty()) {
            return null;
        }
        for (OaContractAmountThreshold t : list) {
            BigDecimal max = t.getThresholdMax();
            if (max == null || amount.compareTo(max) < 0) {
                return t;
            }
        }
        return null;
    }

    private void validate(OaContractAmountThreshold threshold) {
        if (threshold == null) {
            throw new IllegalArgumentException("阈值规则不能为空");
        }
        if (threshold.getThresholdMin() == null) {
            throw new IllegalArgumentException("金额下限必填");
        }
        if (!StringUtils.hasText(threshold.getAmountTier())) {
            throw new IllegalArgumentException("金额档位必填");
        }
        if (!StringUtils.hasText(threshold.getApproverRole())) {
            throw new IllegalArgumentException("审批角色必填");
        }
        if (threshold.getThresholdMax() != null
                && threshold.getThresholdMax().compareTo(threshold.getThresholdMin()) <= 0) {
            throw new IllegalArgumentException("金额上限必须大于下限");
        }
    }
}

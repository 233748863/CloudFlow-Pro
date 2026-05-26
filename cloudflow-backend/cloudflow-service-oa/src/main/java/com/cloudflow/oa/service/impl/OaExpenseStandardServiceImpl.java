package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.domain.vo.OaExpenseExceedDetailVO;
import com.cloudflow.oa.domain.vo.OaExpenseExceedResultVO;
import com.cloudflow.oa.mapper.OaExpenseStandardMapper;
import com.cloudflow.oa.service.IOaExpenseStandardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

/**
 * OA-P0-3 费用标准服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaExpenseStandardServiceImpl implements IOaExpenseStandardService {

    private static final Long DEFAULT_TENANT_ID = 100000L;

    private final OaExpenseStandardMapper standardMapper;

    @Override
    public Page<OaExpenseStandard> page(String keyword, String positionLevel, String category, String city,
                                        String status, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaExpenseStandard> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaExpenseStandard::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.like(OaExpenseStandard::getRemark, keyword);
        }
        if (StringUtils.hasText(positionLevel)) {
            wrapper.eq(OaExpenseStandard::getPositionLevel, positionLevel);
        }
        if (StringUtils.hasText(category)) {
            wrapper.eq(OaExpenseStandard::getCategory, category);
        }
        if (StringUtils.hasText(city)) {
            wrapper.eq(OaExpenseStandard::getCity, city);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaExpenseStandard::getStatus, status);
        }
        wrapper.orderByAsc(OaExpenseStandard::getPositionLevel)
                .orderByAsc(OaExpenseStandard::getCategory);
        return standardMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<OaExpenseStandard> listActive() {
        LambdaQueryWrapper<OaExpenseStandard> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaExpenseStandard::getDeleted, 0)
                .eq(OaExpenseStandard::getStatus, "ACTIVE");
        return standardMapper.selectList(wrapper);
    }

    @Override
    public OaExpenseStandard getById(Long standardId) {
        return standardId == null ? null : standardMapper.selectById(standardId);
    }

    @Override
    @Transactional
    public boolean save(OaExpenseStandard standard) {
        if (standard == null || !StringUtils.hasText(standard.getCategory()) || standard.getLimitAmount() == null) {
            throw new IllegalArgumentException("类别和限额必填");
        }
        if (standard.getTenantId() == null) {
            standard.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(standard.getStatus())) {
            standard.setStatus("ACTIVE");
        }
        if (!StringUtils.hasText(standard.getLimitType())) {
            standard.setLimitType("PER_ITEM");
        }
        standard.setCreateBy(UserContext.getUserName());
        standard.setUpdateBy(UserContext.getUserName());
        return standardMapper.insert(standard) > 0;
    }

    @Override
    @Transactional
    public boolean update(OaExpenseStandard standard) {
        if (standard == null || standard.getStandardId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        standard.setUpdateBy(UserContext.getUserName());
        standard.setUpdateTime(LocalDateTime.now());
        return standardMapper.updateById(standard) > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long standardId) {
        if (standardId == null) {
            return false;
        }
        OaExpenseStandard standard = standardMapper.selectById(standardId);
        if (standard == null) {
            return false;
        }
        standard.setDeleted(1);
        standard.setUpdateBy(UserContext.getUserName());
        standard.setUpdateTime(LocalDateTime.now());
        return standardMapper.updateById(standard) > 0;
    }

    @Override
    public OaExpenseExceedResultVO validateExceed(BizExpenseClaim claim, String applicantPositionLevel,
                                                  String applicantCity) {
        OaExpenseExceedResultVO result = new OaExpenseExceedResultVO();
        List<OaExpenseExceedDetailVO> details = new ArrayList<>();
        BigDecimal totalExceeded = BigDecimal.ZERO;
        if (claim == null || claim.getItems() == null || claim.getItems().isEmpty()) {
            result.setExceeded(false);
            result.setTotalExceededAmount(totalExceeded);
            result.setDetails(details);
            return result;
        }
        List<OaExpenseStandard> activeStandards = listActive();
        if (activeStandards.isEmpty()) {
            result.setExceeded(false);
            result.setTotalExceededAmount(totalExceeded);
            result.setDetails(details);
            return result;
        }
        for (BizExpenseItem item : claim.getItems()) {
            if (item.getAmount() == null) {
                continue;
            }
            String category = StringUtils.hasText(item.getExpenseType()) ? item.getExpenseType() : claim.getCategory();
            OaExpenseStandard matched = matchStandard(activeStandards, applicantPositionLevel, category, applicantCity);
            if (matched == null) {
                continue;
            }
            BigDecimal limit = matched.getLimitAmount();
            if (item.getAmount().compareTo(limit) > 0) {
                BigDecimal exceeded = item.getAmount().subtract(limit);
                totalExceeded = totalExceeded.add(exceeded);
                OaExpenseExceedDetailVO detail = new OaExpenseExceedDetailVO();
                detail.setItemId(item.getId());
                detail.setExpenseType(category);
                detail.setStandardId(matched.getStandardId());
                detail.setStandardLimit(limit);
                detail.setActualAmount(item.getAmount());
                detail.setExceededAmount(exceeded);
                detail.setCity(matched.getCity());
                detail.setLimitType(matched.getLimitType());
                details.add(detail);
            }
        }
        result.setExceeded(!details.isEmpty());
        result.setTotalExceededAmount(totalExceeded);
        result.setDetails(details);
        return result;
    }

    private OaExpenseStandard matchStandard(List<OaExpenseStandard> standards, String positionLevel,
                                            String category, String city) {
        OaExpenseStandard exact = null;
        OaExpenseStandard cityWildcard = null;
        OaExpenseStandard levelWildcard = null;
        for (OaExpenseStandard s : standards) {
            if (!Objects.equals(s.getCategory(), category)) {
                continue;
            }
            boolean levelMatch = !StringUtils.hasText(s.getPositionLevel())
                    || Objects.equals(s.getPositionLevel(), positionLevel);
            boolean cityMatch = !StringUtils.hasText(s.getCity())
                    || Objects.equals(s.getCity(), city);
            if (!levelMatch || !cityMatch) {
                continue;
            }
            if (StringUtils.hasText(s.getPositionLevel()) && StringUtils.hasText(s.getCity())) {
                if (exact == null || s.getLimitAmount().compareTo(exact.getLimitAmount()) < 0) {
                    exact = s;
                }
            } else if (StringUtils.hasText(s.getPositionLevel())) {
                if (cityWildcard == null || s.getLimitAmount().compareTo(cityWildcard.getLimitAmount()) < 0) {
                    cityWildcard = s;
                }
            } else {
                if (levelWildcard == null || s.getLimitAmount().compareTo(levelWildcard.getLimitAmount()) < 0) {
                    levelWildcard = s;
                }
            }
        }
        if (exact != null) return exact;
        if (cityWildcard != null) return cityWildcard;
        return levelWildcard;
    }
}

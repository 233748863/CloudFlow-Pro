package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.domain.vo.OaExpenseExceedResultVO;
import com.cloudflow.oa.mapper.OaExpenseStandardMapper;
import com.cloudflow.oa.mapper.BizExpenseItemMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.cloudflow.oa.service.IOaExpenseStandardService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

/**
 * OA-P0-3 费用标准服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaExpenseStandardServiceImpl implements IOaExpenseStandardService {

    private final OaExpenseStandardMapper standardMapper;
    private final BizExpenseItemMapper itemMapper;
    private final OaIdentityReferenceMapper identities;

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
                .eq(OaExpenseStandard::getStatus, "ACTIVE")
                .orderByAsc(OaExpenseStandard::getStandardId);
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
        standard.setTenantId(OaRecordSupport.tenantId());
        if (!StringUtils.hasText(standard.getStatus())) {
            standard.setStatus("ACTIVE");
        }
        if (!StringUtils.hasText(standard.getLimitType())) {
            standard.setLimitType("PER_ITEM");
        }
        validateStandard(standard);
        standard.setCreateBy(UserContext.getUserName());
        standard.setUpdateBy(UserContext.getUserName());
        return standardMapper.insert(standard) > 0;
    }

    @Override
    @Transactional
    @Audit(name = "更新报销标准", highRisk = true)
    public boolean update(OaExpenseStandard standard) {
        if (standard == null || standard.getStandardId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        validateStandard(standard);
        standard.setTenantId(OaRecordSupport.tenantId());
        standard.setUpdateBy(UserContext.getUserName());
        standard.setUpdateTime(LocalDateTime.now());
        return standardMapper.updateById(standard) > 0;
    }

    @Override
    @Transactional
    @Audit(name = "删除报销标准", highRisk = true)
    public boolean remove(Long standardId) {
        if (standardId == null) {
            return false;
        }
        OaExpenseStandard standard = standardMapper.selectById(standardId);
        if (standard == null) {
            return false;
        }
        return standardMapper.update(null, new LambdaUpdateWrapper<OaExpenseStandard>()
                .eq(OaExpenseStandard::getStandardId, standardId)
                .eq(OaExpenseStandard::getTenantId, OaRecordSupport.tenantId())
                .eq(OaExpenseStandard::getVersion, standard.getVersion())
                .set(OaExpenseStandard::getDeleted, 1)
                .set(OaExpenseStandard::getVersion, standard.getVersion() + 1)
                .set(OaExpenseStandard::getUpdateBy, UserContext.getUserName())
                .set(OaExpenseStandard::getUpdateTime, LocalDateTime.now())) > 0;
    }

    @Override
    public OaExpenseExceedResultVO validateExceed(BizExpenseClaim claim) {
        String positionLevel = identities.applicantPositionLevel(claim.getUserId(), claim.getTenantId());
        OaExpenseLimitCalculator calculator = new OaExpenseLimitCalculator(listActive(), positionLevel);
        OaExpenseLimitCalculator.HistoryRange range = calculator.historyRange(claim.getItems());
        List<BizExpenseItem> committed = range == null ? List.of() : itemMapper.selectCommittedUsage(
                claim.getTenantId(), claim.getUserId(), claim.getId(), range.from(), range.until(), range.expenseTypes());
        return calculator.evaluate(claim.getItems(), committed);
    }

    private void validateStandard(OaExpenseStandard standard) {
        if (!StringUtils.hasText(standard.getCategory()) || standard.getLimitAmount() == null
                || standard.getLimitAmount().signum() < 0) {
            throw new IllegalArgumentException("费用类型和非负限额必填");
        }
        if (standard.getLimitType() == null || !OaExpenseLimitCalculator.LIMIT_TYPES.contains(standard.getLimitType())) {
            throw new IllegalArgumentException("费用限额周期必须为每笔、每天、每月或每年");
        }
        if (standard.getCity() != null) {
            standard.setCity(standard.getCity().strip());
            if (standard.getCity().length() > 60) throw new IllegalArgumentException("城市最多60个字符");
        }
        if (standard.getPositionLevel() != null) standard.setPositionLevel(standard.getPositionLevel().strip());
    }
}

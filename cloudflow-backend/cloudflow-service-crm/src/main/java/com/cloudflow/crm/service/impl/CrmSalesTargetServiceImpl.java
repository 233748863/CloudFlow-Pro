package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.mapper.CrmSalesTargetMapper;
import com.cloudflow.crm.service.CrmPerformanceQueryService;
import com.cloudflow.crm.service.ICrmSalesTargetService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CrmSalesTargetServiceImpl extends CrmServiceSupport<CrmSalesTargetMapper, CrmSalesTarget>
        implements ICrmSalesTargetService {

    private final CrmPerformanceQueryService performanceQueryService;

    public CrmSalesTargetServiceImpl(CrmPerformanceQueryService performanceQueryService) {
        this.performanceQueryService = performanceQueryService;
    }

    @Override
    public PageResult<CrmSalesTarget> queryPage(CrmSalesTarget query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmSalesTarget> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmSalesTarget::getDelFlag, CrmConstants.DelFlag.NORMAL).orderByDesc(CrmSalesTarget::getUpdateTime);
        likeIfPresent(wrapper, CrmSalesTarget::getTargetName, query.getTargetName());
        likeIfPresent(wrapper, CrmSalesTarget::getTargetNo, query.getTargetNo());
        eqIfPresent(wrapper, CrmSalesTarget::getDimensionType, query.getDimensionType());
        eqIfPresent(wrapper, CrmSalesTarget::getPeriodType, query.getPeriodType());
        eqIfPresent(wrapper, CrmSalesTarget::getTargetYear, query.getTargetYear());
        eqIfPresent(wrapper, CrmSalesTarget::getTargetPeriod, query.getTargetPeriod());
        eqIfPresent(wrapper, CrmSalesTarget::getStatus, query.getStatus());
        if (query.getOwnerId() != null) {
            wrapper.eq(CrmSalesTarget::getOwnerId, query.getOwnerId());
        }
        if (query.getDeptId() != null) {
            wrapper.eq(CrmSalesTarget::getDeptId, query.getDeptId());
        }
        PageResult<CrmSalesTarget> pageResult = pageResult(pageQuery, wrapper);
        attachPerformance(pageResult.getRows());
        return pageResult;
    }

    @Override
    public boolean createSalesTarget(CrmSalesTarget salesTarget) {
        validate(salesTarget);
        if (!StringUtils.hasText(salesTarget.getTargetNo())) {
            salesTarget.setTargetNo(Localize.nextNo(CrmConstants.NoPrefix.SALES_TARGET));
        }
        if (!StringUtils.hasText(salesTarget.getStatus())) {
            salesTarget.setStatus(CrmConstants.SalesTargetStatus.ACTIVE);
        }
        Localize.fillCommonAudit(salesTarget, currentTenantId(), currentUserName(), now());
        return save(salesTarget);
    }

    @Override
    public boolean updateSalesTarget(CrmSalesTarget salesTarget) {
        if (salesTarget == null || salesTarget.getSalesTargetId() == null) {
            throw new IllegalArgumentException("销售目标ID不能为空");
        }
        validate(salesTarget);
        CrmSalesTarget persisted = requireById(salesTarget.getSalesTargetId(), "销售目标不存在");
        salesTarget.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(salesTarget.getTargetNo())) {
            salesTarget.setTargetNo(persisted.getTargetNo());
        }
        salesTarget.setUpdateBy(currentUserName());
        salesTarget.setUpdateTime(now());
        return updateById(salesTarget);
    }

    private void attachPerformance(List<CrmSalesTarget> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        List<CrmSalesTarget> ownerTargets = rows.stream()
                .filter(item -> CrmConstants.SalesTargetDimension.OWNER.equals(item.getDimensionType()) && item.getOwnerId() != null)
                .toList();
        List<CrmSalesTarget> deptTargets = rows.stream()
                .filter(item -> CrmConstants.SalesTargetDimension.DEPT.equals(item.getDimensionType()) && item.getDeptId() != null)
                .toList();

        Map<String, Map<Long, BigDecimal>> ownerPerformance = buildPerformanceMap(ownerTargets, true);
        Map<String, Map<Long, BigDecimal>> deptPerformance = buildPerformanceMap(deptTargets, false);

        for (CrmSalesTarget item : rows) {
            Long refId = CrmConstants.SalesTargetDimension.OWNER.equals(item.getDimensionType()) ? item.getOwnerId() : item.getDeptId();
            Map<String, Map<Long, BigDecimal>> source = CrmConstants.SalesTargetDimension.OWNER.equals(item.getDimensionType())
                    ? ownerPerformance : deptPerformance;
            BigDecimal achievedAmount = source.getOrDefault(periodKey(item), Map.of()).getOrDefault(refId, BigDecimal.ZERO);
            BigDecimal targetAmount = zero(item.getTargetAmount());
            BigDecimal gapAmount = targetAmount.subtract(achievedAmount);
            BigDecimal completionRate = targetAmount.signum() == 0
                    ? BigDecimal.ZERO
                    : achievedAmount.multiply(BigDecimal.valueOf(100)).divide(targetAmount, 2, RoundingMode.HALF_UP);
            item.setAchievedAmount(achievedAmount);
            item.setGapAmount(gapAmount);
            item.setCompletionRate(completionRate);
            item.setPeriodLabel(buildPeriodLabel(item));
        }
    }

    private Map<String, Map<Long, BigDecimal>> buildPerformanceMap(List<CrmSalesTarget> targets, boolean byOwner) {
        Map<String, List<CrmSalesTarget>> grouped = targets.stream().collect(Collectors.groupingBy(this::periodKey, LinkedHashMap::new, Collectors.toList()));
        Map<String, Map<Long, BigDecimal>> result = new LinkedHashMap<>();
        for (Map.Entry<String, List<CrmSalesTarget>> entry : grouped.entrySet()) {
            if (entry.getValue().isEmpty()) {
                continue;
            }
            CrmSalesTarget sample = entry.getValue().get(0);
            String startDate = buildStartDate(sample);
            String endDate = buildEndDate(sample);
            List<Long> ids = entry.getValue().stream()
                    .map(item -> byOwner ? item.getOwnerId() : item.getDeptId())
                    .filter(id -> id != null)
                    .distinct()
                    .toList();
            List<CrmPerformanceSummaryVO> summaries = byOwner
                    ? performanceQueryService.summarizeByOwner(ids, startDate, endDate)
                    : performanceQueryService.summarizeByDept(ids, startDate, endDate);
            Map<Long, BigDecimal> amountMap = summaries.stream().collect(Collectors.toMap(
                    CrmPerformanceSummaryVO::getTargetId,
                    item -> zero(item.getReceivedAmount()),
                    (left, right) -> right,
                    LinkedHashMap::new
            ));
            result.put(entry.getKey(), amountMap);
        }
        return result;
    }

    private void validate(CrmSalesTarget salesTarget) {
        if (salesTarget == null) {
            throw new IllegalArgumentException("销售目标不能为空");
        }
        if (!StringUtils.hasText(salesTarget.getTargetName())) {
            throw new IllegalArgumentException("目标名称不能为空");
        }
        if (!StringUtils.hasText(salesTarget.getDimensionType())) {
            throw new IllegalArgumentException("维度类型不能为空");
        }
        if (!CrmConstants.SalesTargetDimension.OWNER.equals(salesTarget.getDimensionType())
                && !CrmConstants.SalesTargetDimension.DEPT.equals(salesTarget.getDimensionType())) {
            throw new IllegalArgumentException("维度类型不支持");
        }
        if (!StringUtils.hasText(salesTarget.getPeriodType())) {
            throw new IllegalArgumentException("周期类型不能为空");
        }
        if (salesTarget.getTargetYear() == null) {
            throw new IllegalArgumentException("目标年份不能为空");
        }
        if (salesTarget.getTargetAmount() == null || salesTarget.getTargetAmount().signum() < 0) {
            throw new IllegalArgumentException("目标金额不能为空且不能小于0");
        }
        if (CrmConstants.SalesTargetDimension.OWNER.equals(salesTarget.getDimensionType())) {
            if (salesTarget.getOwnerId() == null) {
                salesTarget.setOwnerId(UserContext.getUserId());
            }
            if (!StringUtils.hasText(salesTarget.getOwnerName())) {
                salesTarget.setOwnerName(currentUserName());
            }
            salesTarget.setDeptId(null);
            salesTarget.setDeptName(null);
        } else {
            if (salesTarget.getDeptId() == null) {
                throw new IllegalArgumentException("部门目标必须填写部门ID");
            }
            if (!StringUtils.hasText(salesTarget.getDeptName())) {
                throw new IllegalArgumentException("部门目标必须填写部门名称");
            }
            salesTarget.setOwnerId(null);
            salesTarget.setOwnerName(null);
        }
        normalizePeriod(salesTarget);
        if (!StringUtils.hasText(salesTarget.getStatus())) {
            salesTarget.setStatus(CrmConstants.SalesTargetStatus.ACTIVE);
        }
    }

    private void normalizePeriod(CrmSalesTarget salesTarget) {
        String periodType = salesTarget.getPeriodType();
        Integer period = salesTarget.getTargetPeriod();
        if (CrmConstants.SalesTargetPeriod.YEAR.equals(periodType)) {
            salesTarget.setTargetPeriod(null);
            return;
        }
        if (period == null) {
            throw new IllegalArgumentException("目标周期不能为空");
        }
        if (CrmConstants.SalesTargetPeriod.MONTH.equals(periodType)) {
            if (period < 1 || period > 12) {
                throw new IllegalArgumentException("月度目标周期范围必须在1到12之间");
            }
            return;
        }
        if (CrmConstants.SalesTargetPeriod.QUARTER.equals(periodType)) {
            if (period < 1 || period > 4) {
                throw new IllegalArgumentException("季度目标周期范围必须在1到4之间");
            }
            return;
        }
        throw new IllegalArgumentException("周期类型不支持");
    }

    private String periodKey(CrmSalesTarget item) {
        return item.getPeriodType() + "-" + item.getTargetYear() + "-" + (item.getTargetPeriod() == null ? 0 : item.getTargetPeriod());
    }

    private String buildPeriodLabel(CrmSalesTarget item) {
        if (CrmConstants.SalesTargetPeriod.YEAR.equals(item.getPeriodType())) {
            return item.getTargetYear() + "年";
        }
        if (CrmConstants.SalesTargetPeriod.QUARTER.equals(item.getPeriodType())) {
            return item.getTargetYear() + "年 Q" + item.getTargetPeriod();
        }
        return item.getTargetYear() + "年 " + item.getTargetPeriod() + "月";
    }

    private String buildStartDate(CrmSalesTarget item) {
        int year = item.getTargetYear();
        if (CrmConstants.SalesTargetPeriod.YEAR.equals(item.getPeriodType())) {
            return LocalDate.of(year, 1, 1).toString();
        }
        if (CrmConstants.SalesTargetPeriod.QUARTER.equals(item.getPeriodType())) {
            int month = ((item.getTargetPeriod() == null ? 1 : item.getTargetPeriod()) - 1) * 3 + 1;
            return LocalDate.of(year, month, 1).toString();
        }
        return LocalDate.of(year, item.getTargetPeriod(), 1).toString();
    }

    private String buildEndDate(CrmSalesTarget item) {
        int year = item.getTargetYear();
        if (CrmConstants.SalesTargetPeriod.YEAR.equals(item.getPeriodType())) {
            return LocalDate.of(year, 12, 31).toString();
        }
        if (CrmConstants.SalesTargetPeriod.QUARTER.equals(item.getPeriodType())) {
            int month = (item.getTargetPeriod() == null ? 1 : item.getTargetPeriod()) * 3;
            return LocalDate.of(year, month, 1).withDayOfMonth(LocalDate.of(year, month, 1).lengthOfMonth()).toString();
        }
        LocalDate lastDay = LocalDate.of(year, item.getTargetPeriod(), 1);
        return lastDay.withDayOfMonth(lastDay.lengthOfMonth()).toString();
    }

    private BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}

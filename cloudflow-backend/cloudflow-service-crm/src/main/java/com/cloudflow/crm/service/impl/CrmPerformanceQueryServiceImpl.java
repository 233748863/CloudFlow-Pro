package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmFollowUpMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.ICrmPerformanceQueryService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 基于本地 mapper 的业绩聚合。
 * 日期过滤按各表的业务时间：
 * - 商机赢单：stageChangedTime（默认 createTime）
 * - 回款：receivedDate 对回款、updateTime 对未到账
 * - 跟进：followUpTime
 */
@Service
@RequiredArgsConstructor
public class CrmPerformanceQueryServiceImpl implements ICrmPerformanceQueryService {

    private static final String DIM_OWNER = "OWNER";
    private static final String DIM_DEPT = "DEPT";

    private final CrmCustomerMapper customerMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmReceivableMapper receivableMapper;
    private final CrmFollowUpMapper followUpMapper;

    @Override
    public List<CrmPerformanceSummaryVO> summarizeByOwner(List<Long> ownerIds, String startDate, String endDate) {
        return aggregate(DIM_OWNER, ownerIds, startDate, endDate);
    }

    @Override
    public List<CrmPerformanceSummaryVO> summarizeByDept(List<Long> deptIds, String startDate, String endDate) {
        return aggregate(DIM_DEPT, deptIds, startDate, endDate);
    }

    @Override
    public List<CrmPerformanceSummaryVO> topOwners(int limit, String startDate, String endDate) {
        return aggregate(DIM_OWNER, null, startDate, endDate).stream()
                .sorted(Comparator.comparing(CrmPerformanceSummaryVO::getReceivedAmount,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(Math.max(1, limit))
                .toList();
    }

    @Override
    public List<CrmPerformanceSummaryVO> topDepartments(int limit, String startDate, String endDate) {
        return aggregate(DIM_DEPT, null, startDate, endDate).stream()
                .sorted(Comparator.comparing(CrmPerformanceSummaryVO::getReceivedAmount,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(Math.max(1, limit))
                .toList();
    }

    private List<CrmPerformanceSummaryVO> aggregate(String dimension,
                                                    Collection<Long> filterIds,
                                                    String startDate,
                                                    String endDate) {
        LocalDateTime start = parseStart(startDate);
        LocalDateTime end = parseEnd(endDate);

        Function<CrmOpportunity, Long> oppKey = pickKey(dimension,
                CrmOpportunity::getOwnerId, CrmOpportunity::getDeptId);
        Function<CrmOpportunity, String> oppName = pickName(dimension,
                CrmOpportunity::getOwnerName, CrmOpportunity::getDeptName);
        Function<CrmReceivable, Long> rcvKey = pickKey(dimension,
                CrmReceivable::getOwnerId, customer -> null);
        Function<CrmCustomer, Long> cusKey = pickKey(dimension,
                CrmCustomer::getOwnerId, CrmCustomer::getDeptId);
        Function<CrmCustomer, String> cusName = pickName(dimension,
                CrmCustomer::getOwnerName, CrmCustomer::getDeptName);
        Function<CrmFollowUp, Long> fupKey = pickKey(dimension,
                CrmFollowUp::getOwnerId, customer -> null);

        Map<Long, CrmPerformanceSummaryVO> buckets = new LinkedHashMap<>();

        // 客户维度：确定维度名称 + 客户数
        List<CrmCustomer> customers = customerMapper.selectList(new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL));
        for (CrmCustomer customer : customers) {
            Long key = cusKey.apply(customer);
            if (!keep(key, filterIds)) {
                continue;
            }
            CrmPerformanceSummaryVO bucket = bucket(buckets, dimension, key, cusName.apply(customer));
            bucket.setCustomerCount(bucket.getCustomerCount() + 1);
        }

        // 商机：赢单数 + 赢单金额 + 合同金额（以 quote/contract 建模需要联 quoteMapper，暂以赢单金额近似）
        List<CrmOpportunity> opportunities = opportunityMapper.selectList(new LambdaQueryWrapper<CrmOpportunity>()
                .eq(CrmOpportunity::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmOpportunity::getStage, CrmConstants.OpportunityStage.WON));
        for (CrmOpportunity opportunity : opportunities) {
            if (!withinRange(firstNonNull(opportunity.getStageChangedTime(), opportunity.getUpdateTime(), opportunity.getCreateTime()), start, end)) {
                continue;
            }
            Long key = oppKey.apply(opportunity);
            if (!keep(key, filterIds)) {
                continue;
            }
            CrmPerformanceSummaryVO bucket = bucket(buckets, dimension, key, oppName.apply(opportunity));
            bucket.setWonOpportunityCount(bucket.getWonOpportunityCount() + 1);
            BigDecimal amount = zero(opportunity.getExpectedAmount());
            bucket.setWonAmount(bucket.getWonAmount().add(amount));
            bucket.setContractAmount(bucket.getContractAmount().add(amount));
        }

        // 回款：已到账金额 / 未到账金额
        List<CrmReceivable> receivables = receivableMapper.selectList(new LambdaQueryWrapper<CrmReceivable>()
                .eq(CrmReceivable::getDeleted, CrmConstants.DelFlag.NORMAL));
        // dept 维度要借助 customer 回表
        Map<Long, Long> customerToDept = new LinkedHashMap<>();
        if (DIM_DEPT.equals(dimension)) {
            customers.forEach(c -> customerToDept.put(c.getCustomerId(), c.getDeptId()));
        }
        for (CrmReceivable receivable : receivables) {
            Long key;
            if (DIM_DEPT.equals(dimension)) {
                key = customerToDept.get(receivable.getCustomerId());
            } else {
                key = rcvKey.apply(receivable);
            }
            if (!keep(key, filterIds)) {
                continue;
            }
            BigDecimal received = zero(receivable.getReceivedAmount());
            BigDecimal outstanding = zero(receivable.getOutstandingAmount());
            boolean withinReceived = withinRange(toDateTime(receivable.getReceivedDate()), start, end);
            boolean withinUpdate = withinRange(firstNonNull(receivable.getUpdateTime(), receivable.getCreateTime()), start, end);
            if (received.signum() > 0 && !withinReceived) {
                continue;
            }
            if (received.signum() == 0 && outstanding.signum() > 0 && !withinUpdate) {
                continue;
            }
            CrmPerformanceSummaryVO bucket = bucket(buckets, dimension, key, nameForReceivable(receivable, dimension));
            bucket.setReceivedAmount(bucket.getReceivedAmount().add(received));
            bucket.setOutstandingAmount(bucket.getOutstandingAmount().add(outstanding));
        }

        // 跟进
        List<CrmFollowUp> followUps = followUpMapper.selectList(new LambdaQueryWrapper<CrmFollowUp>()
                .eq(CrmFollowUp::getDeleted, CrmConstants.DelFlag.NORMAL));
        for (CrmFollowUp followUp : followUps) {
            if (!withinRange(firstNonNull(followUp.getFollowUpTime(), followUp.getCreateTime()), start, end)) {
                continue;
            }
            Long key;
            if (DIM_DEPT.equals(dimension)) {
                key = customerToDept.get(followUp.getCustomerId());
            } else {
                key = fupKey.apply(followUp);
            }
            if (!keep(key, filterIds)) {
                continue;
            }
            CrmPerformanceSummaryVO bucket = bucket(buckets, dimension, key,
                    DIM_OWNER.equals(dimension) ? followUp.getOwnerName() : null);
            bucket.setFollowUpCount(bucket.getFollowUpCount() + 1);
        }

        List<CrmPerformanceSummaryVO> result = new ArrayList<>(buckets.values());
        result.removeIf(item -> item.getTargetId() == null);
        return result;
    }

    private CrmPerformanceSummaryVO bucket(Map<Long, CrmPerformanceSummaryVO> buckets,
                                           String dimension, Long key, String fallbackName) {
        return buckets.computeIfAbsent(key, id -> {
            CrmPerformanceSummaryVO vo = new CrmPerformanceSummaryVO();
            vo.setDimension(dimension);
            vo.setTargetId(id);
            vo.setTargetName(fallbackName);
            vo.setWonAmount(BigDecimal.ZERO);
            vo.setContractAmount(BigDecimal.ZERO);
            vo.setReceivedAmount(BigDecimal.ZERO);
            vo.setOutstandingAmount(BigDecimal.ZERO);
            return vo;
        });
    }

    private String nameForReceivable(CrmReceivable receivable, String dimension) {
        return DIM_OWNER.equals(dimension) ? receivable.getOwnerName() : null;
    }

    private <T> Function<T, Long> pickKey(String dimension, Function<T, Long> ownerGetter, Function<T, Long> deptGetter) {
        return DIM_OWNER.equals(dimension) ? ownerGetter : deptGetter;
    }

    private <T> Function<T, String> pickName(String dimension, Function<T, String> ownerName, Function<T, String> deptName) {
        return DIM_OWNER.equals(dimension) ? ownerName : deptName;
    }

    private boolean keep(Long key, Collection<Long> filterIds) {
        if (key == null) {
            return false;
        }
        if (filterIds == null || filterIds.isEmpty()) {
            return true;
        }
        return filterIds.contains(key);
    }

    private boolean withinRange(LocalDateTime value, LocalDateTime start, LocalDateTime end) {
        if (value == null) {
            return false;
        }
        if (start != null && value.isBefore(start)) {
            return false;
        }
        return end == null || !value.isAfter(end);
    }

    private LocalDateTime parseStart(String startDate) {
        if (!StringUtils.hasText(startDate)) {
            return null;
        }
        return LocalDate.parse(startDate).atStartOfDay();
    }

    private LocalDateTime parseEnd(String endDate) {
        if (!StringUtils.hasText(endDate)) {
            return null;
        }
        return LocalDate.parse(endDate).atTime(LocalTime.MAX);
    }

    private LocalDateTime toDateTime(LocalDate date) {
        return date == null ? null : date.atStartOfDay();
    }

    private BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    @SafeVarargs
    private static <T> T firstNonNull(T... values) {
        if (values == null) {
            return null;
        }
        for (T value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }
}

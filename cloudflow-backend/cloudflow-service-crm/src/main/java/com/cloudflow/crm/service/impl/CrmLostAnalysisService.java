package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO;
import com.cloudflow.crm.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CrmLostAnalysisService {
    private final CrmLostReasonMapper reasonMapper;
    private final CrmCompetitorMapper competitorMapper;
    private final CrmOpportunityLostDetailMapper detailMapper;
    private final CrmOpportunityMapper opportunityMapper;
    private final CrmReferenceService references;

    public PageResult<CrmLostReason> reasons(PageQuery page) {
        return PageResult.build(reasonMapper.selectPage(page.build(), new LambdaQueryWrapper<CrmLostReason>()
                .orderByAsc(CrmLostReason::getSortNo, CrmLostReason::getReasonId)));
    }

    public PageResult<CrmCompetitor> competitors(PageQuery page) {
        return PageResult.build(competitorMapper.selectPage(page.build(), new LambdaQueryWrapper<CrmCompetitor>()
                .orderByAsc(CrmCompetitor::getCompetitorId)));
    }

    @Audit(name = "维护丢单原因", spel = "#reason", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public Long saveReason(CrmLostReason reason) {
        reason.setReasonCode(CrmRecordSupport.text(reason.getReasonCode(), 50, "原因编码"));
        reason.setReasonName(CrmRecordSupport.text(reason.getReasonName(), 120, "原因名称"));
        reason.setReasonCategory(CrmRecordSupport.code(reason.getReasonCategory(), "OTHER",
                Set.of("PRICE", "PRODUCT", "SERVICE", "COMPETITOR", "TIMING", "BUDGET", "RELATIONSHIP", "OTHER"), "原因分类"));
        reason.setStatus(CrmRecordSupport.code(reason.getStatus(), "ACTIVE", Set.of("ACTIVE", "INACTIVE"), "原因状态"));
        if (reason.getSortNo() == null) reason.setSortNo(0);
        if (reason.getReasonId() == null) { CrmRecordSupport.create(reason, "reasonId"); reasonMapper.insert(reason); }
        else { CrmRecordSupport.update(reason, reasonMapper.selectById(reason.getReasonId())); CrmRecordSupport.saved(reasonMapper.updateById(reason)); }
        return reason.getReasonId();
    }

    @Audit(name = "维护竞争对手", spel = "#competitor", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public Long saveCompetitor(CrmCompetitor competitor) {
        competitor.setCompetitorCode(CrmRecordSupport.text(competitor.getCompetitorCode(), 50, "竞对编码"));
        competitor.setCompetitorName(CrmRecordSupport.text(competitor.getCompetitorName(), 120, "竞对名称"));
        competitor.setThreatLevel(CrmRecordSupport.code(competitor.getThreatLevel(), "MEDIUM", Set.of("HIGH", "MEDIUM", "LOW"), "威胁程度"));
        competitor.setStatus(CrmRecordSupport.code(competitor.getStatus(), "ACTIVE", Set.of("ACTIVE", "INACTIVE"), "竞对状态"));
        if (competitor.getCompetitorId() == null) { CrmRecordSupport.create(competitor, "competitorId"); competitorMapper.insert(competitor); }
        else { CrmRecordSupport.update(competitor, competitorMapper.selectById(competitor.getCompetitorId())); CrmRecordSupport.saved(competitorMapper.updateById(competitor)); }
        return competitor.getCompetitorId();
    }

    public void validateCompetitor(Long competitorId) {
        if (competitorId == null) return;
        CrmCompetitor competitor = CrmRecordSupport.require(competitorMapper.selectById(competitorId), "竞争对手不存在");
        if (!"ACTIVE".equals(competitor.getStatus())) throw new CrmBusinessException("竞争对手已停用");
    }

    public static void validateShape(List<CrmOpportunityLossDTO.Reason> reasons) {
        if (reasons == null || reasons.isEmpty() || reasons.size() > 20) throw new CrmBusinessException("丢单原因须为1至20项");
        Set<Long> seen = new HashSet<>();
        int primaryCount = 0;
        for (CrmOpportunityLossDTO.Reason reason : reasons) {
            if (reason == null || reason.getReasonId() == null || !seen.add(reason.getReasonId())) throw new CrmBusinessException("丢单原因不能为空或重复");
            if (Boolean.TRUE.equals(reason.getIsPrimary())) primaryCount++;
            if (reason.getAmountLost() != null) CrmRecordSupport.money(reason.getAmountLost(), "丢单金额");
        }
        if (primaryCount != 1) throw new CrmBusinessException("必须且只能指定一个主要丢单原因");
    }

    public void validateReasons(List<CrmOpportunityLossDTO.Reason> reasons) {
        validateShape(reasons);
        for (CrmOpportunityLossDTO.Reason detail : reasons) {
            CrmLostReason reason = CrmRecordSupport.require(reasonMapper.selectById(detail.getReasonId()), "丢单原因不存在");
            if (!"ACTIVE".equals(reason.getStatus())) throw new CrmBusinessException("丢单原因已停用");
            validateCompetitor(detail.getCompetitorId());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void applyApproved(CrmOpportunity opportunity, List<CrmOpportunityLossDTO.Reason> reasons) {
        validateShape(reasons);
        detailMapper.delete(new LambdaQueryWrapper<CrmOpportunityLostDetail>().eq(CrmOpportunityLostDetail::getOpportunityId, opportunity.getOpportunityId()));
        for (CrmOpportunityLossDTO.Reason input : reasons) {
            CrmRecordSupport.require(reasonMapper.selectById(input.getReasonId()), "审批中的丢单原因已删除，请恢复配置后重试");
            if (input.getCompetitorId() != null) CrmRecordSupport.require(competitorMapper.selectById(input.getCompetitorId()), "审批中的竞争对手已删除");
            CrmOpportunityLostDetail detail = new CrmOpportunityLostDetail();
            CrmRecordSupport.create(detail, "detailId"); detail.setOpportunityId(opportunity.getOpportunityId());
            detail.setLostReasonId(input.getReasonId()); detail.setCompetitorId(input.getCompetitorId());
            detail.setAmountLost(input.getAmountLost() == null ? opportunity.getExpectedAmount() : input.getAmountLost());
            detail.setIsPrimaryFlag(Boolean.TRUE.equals(input.getIsPrimary()) ? 1 : 0); detail.setRemark(input.getRemark());
            detailMapper.insert(detail);
        }
    }

    public List<CrmOpportunityLostDetail> details(Long opportunityId) {
        references.opportunity(opportunityId);
        return detailMapper.selectList(new LambdaQueryWrapper<CrmOpportunityLostDetail>().eq(CrmOpportunityLostDetail::getOpportunityId, opportunityId));
    }

    public Report report(LocalDate start, LocalDate end) {
        if (start != null && end != null && end.isBefore(start)) throw new CrmBusinessException("统计日期范围无效");
        List<CrmOpportunity> opportunities = opportunityMapper.selectPageByDataScope(new Page<>(1, Long.MAX_VALUE, false),
                new CrmOpportunity(), DataScopeUtils.listScope("scope_dept_id", "scope_owner_id")).getRecords().stream()
                .filter(opportunity -> Set.of("WON", "LOST").contains(opportunity.getStage()))
                .filter(opportunity -> start == null || opportunity.getStageChangedTime() != null && !opportunity.getStageChangedTime().toLocalDate().isBefore(start))
                .filter(opportunity -> end == null || opportunity.getStageChangedTime() != null && !opportunity.getStageChangedTime().toLocalDate().isAfter(end)).toList();
        if (opportunities.isEmpty()) return new Report(List.of(), List.of(), List.of());
        List<Long> lostIds = opportunities.stream().filter(opportunity -> "LOST".equals(opportunity.getStage())).map(CrmOpportunity::getOpportunityId).toList();
        List<CrmOpportunityLostDetail> details = new ArrayList<>();
        for (int offset = 0; offset < lostIds.size(); offset += 500) {
            details.addAll(detailMapper.selectList(new LambdaQueryWrapper<CrmOpportunityLostDetail>()
                    .in(CrmOpportunityLostDetail::getOpportunityId, lostIds.subList(offset, Math.min(offset + 500, lostIds.size())))));
        }
        Map<Long, CrmLostReason> reasons = reasonMapper.selectList(new LambdaQueryWrapper<>()).stream().collect(Collectors.toMap(CrmLostReason::getReasonId, Function.identity()));
        List<ReasonTotal> byReason = details.stream().collect(Collectors.groupingBy(CrmOpportunityLostDetail::getLostReasonId)).entrySet().stream()
                .map(entry -> new ReasonTotal(entry.getKey(), reasons.containsKey(entry.getKey()) ? reasons.get(entry.getKey()).getReasonName() : "已停用原因",
                        entry.getValue().stream().map(CrmOpportunityLostDetail::getOpportunityId).distinct().count(),
                        entry.getValue().stream().map(CrmOpportunityLostDetail::getAmountLost).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add)))
                .sorted(Comparator.comparingLong(ReasonTotal::count).reversed().thenComparing(ReasonTotal::reasonId)).toList();
        List<CompetitorTotal> byCompetitor = competitorMapper.selectList(new LambdaQueryWrapper<>()).stream().map(competitor -> new CompetitorTotal(
                competitor.getCompetitorId(), competitor.getCompetitorName(), opportunities.stream()
                .filter(opportunity -> "WON".equals(opportunity.getStage()) && competitor.getCompetitorId().equals(opportunity.getCompetitorId())).count(),
                details.stream().filter(detail -> competitor.getCompetitorId().equals(detail.getCompetitorId()))
                        .map(CrmOpportunityLostDetail::getOpportunityId).distinct().count())).toList();
        List<Trend> trend = opportunities.stream().filter(opportunity -> "LOST".equals(opportunity.getStage()) && opportunity.getStageChangedTime() != null)
                .collect(Collectors.groupingBy(opportunity -> opportunity.getStageChangedTime().toLocalDate().withDayOfMonth(1).toString(), TreeMap::new, Collectors.toList()))
                .entrySet().stream().map(entry -> new Trend(entry.getKey(), entry.getValue().size(), entry.getValue().stream()
                        .map(CrmOpportunity::getExpectedAmount).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add))).toList();
        return new Report(byReason, byCompetitor, trend);
    }

    public record ReasonTotal(Long reasonId, String reasonName, long count, BigDecimal amount) { }
    public record CompetitorTotal(Long competitorId, String competitorName, long wonCount, long lostCount) { }
    public record Trend(String month, long count, BigDecimal amount) { }
    public record Report(List<ReasonTotal> reasons, List<CompetitorTotal> competitors, List<Trend> trend) { }
}

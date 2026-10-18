package com.cloudflow.oa.service.impl;

import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.domain.vo.OaTimesheetDayTotal;
import com.cloudflow.oa.domain.vo.OaTimesheetReversalTotals;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaTimesheetCalculationService {
    private final OaActivityCatalogService catalog;
    private final OaProjectMapper projects;
    private final OaProjectTaskMapper tasks;
    private final OaTimesheetMapper sheets;
    private final OaTimesheetDetailMapper detailsMapper;
    private final OaTimesheetQueryMapper query;
    private final SysConfigHelper config;
    private final OaBusinessRuleService rules;

    public void prepare(OaTimesheet sheet, List<OaTimesheetDetail> details, OaIdentityReference employee, boolean requireRates) {
        if (details == null || details.isEmpty() || details.size() > 500) throw new IllegalArgumentException("工时单需要1至500条明细");
        OaRecordSupport.require(sheet.getStartDate(), "工时开始日期不能为空"); OaRecordSupport.require(sheet.getEndDate(), "工时结束日期不能为空");
        long span = ChronoUnit.DAYS.between(sheet.getStartDate(), sheet.getEndDate());
        if (span < 0 || span > 30) throw new IllegalArgumentException("工时单日期跨度必须为1至31天");
        for (OaTimesheetDetail detail : details) {
            OaRecordSupport.require(detail.getProjectId(), "工时项目不能为空"); OaRecordSupport.require(detail.getActivityTypeId(), "活动类型不能为空");
        }
        catalog.lockTypes(details.stream().map(OaTimesheetDetail::getActivityTypeId).toList());
        Map<Long, OaProject> projectLookup = new HashMap<>();
        Map<LocalDate, Set<Long>> availableByDate = new HashMap<>();
        for (Long id : details.stream().map(OaTimesheetDetail::getProjectId).distinct().sorted().toList()) projectLookup.put(id, OaRecordSupport.active(projects.selectForUpdate(id, OaRecordSupport.tenantId())));
        Map<Long, OaTimesheetReversalTotals> reversals = new HashMap<>();
        Map<LocalDate, BigDecimal> daily = new HashMap<>();
        for (OaTimesheetDayTotal day : query.dailyHours(OaRecordSupport.tenantId(), employee.getId(), sheet.getTimesheetId(), sheet.getStartDate(), sheet.getEndDate())) daily.put(day.getWorkDate(), day.getHours());
        for (OaTimesheetDetail detail : details) {
            OaProject project = projectLookup.get(detail.getProjectId());
            detail.setProjectName(project.getProjectName());
            detail.setWorkDate(OaRecordSupport.require(detail.getWorkDate(), "工作日期不能为空"));
            if (detail.getWorkDate().isBefore(sheet.getStartDate()) || detail.getWorkDate().isAfter(sheet.getEndDate()) || detail.getWorkDate().isAfter(LocalDate.now())) throw new IllegalArgumentException("工作日期必须位于单据期间内且不能在未来");
            detail.setHours(OaRecordSupport.decimal(detail.getHours(), 6, 2, true, "工时"));
            if (detail.getHours().signum() == 0) throw new IllegalArgumentException("单条工时不能为0");
            detail.setDescription(OaRecordSupport.text(detail.getDescription(), 10000, "工作内容"));
            if (detail.getHours().signum() < 0) prepareReversal(sheet, detail, employee, reversals);
            else {
                if (detail.getReversalOfDetailId() != null) throw new IllegalArgumentException("正数工时不能关联冲正来源");
                Set<Long> available = availableByDate.computeIfAbsent(detail.getWorkDate(), workDate ->
                        query.availableProjectsForPeriod(OaRecordSupport.tenantId(), employee.getUserId(), workDate, workDate)
                                .stream().map(OaProject::getProjectId).collect(java.util.stream.Collectors.toSet()));
                if (!available.contains(project.getProjectId()) || Set.of("ARCHIVED", "CANCELLED").contains(project.getStatus())) throw new IllegalArgumentException("只能填报本人在工作日期参与的有效项目");
                if (detail.getTaskId() != null) {
                    OaProjectTask task = OaRecordSupport.active(tasks.selectById(detail.getTaskId()));
                    OaRecordSupport.same(task.getProjectId(), project.getProjectId(), "任务不属于所选项目");
                    if (Integer.valueOf(1).equals(task.getIsGroupFlag()) || "CANCELLED".equals(task.getStatus())) throw new IllegalArgumentException("分组或取消任务不能直接填报工时");
                }
                OaActivityType type = catalog.requireType(detail.getActivityTypeId());
                detail.setBillableFlag(detail.getBillableFlag() == null ? type.getBillableDefaultFlag() : OaRecordSupport.flag(detail.getBillableFlag()));
                OaActivityCost rate = catalog.resolve(detail.getActivityTypeId(), employee, detail.getWorkDate(), requireRates);
                detail.setCostingRate(rate == null ? null : rate.getCostingRate()); detail.setBillingRate(rate == null ? null : rate.getBillingRate());
                if ((detail.getFromTime() == null) != (detail.getToTime() == null)) throw new IllegalArgumentException("开始与结束时刻必须同时填写");
                if (detail.getFromTime() != null) {
                    long seconds = ChronoUnit.SECONDS.between(detail.getFromTime(), detail.getToTime());
                    if (seconds <= 0 || BigDecimal.valueOf(seconds).divide(BigDecimal.valueOf(3600), 2, RoundingMode.HALF_UP).compareTo(detail.getHours()) != 0) throw new IllegalArgumentException("时段长度与填写工时不一致");
                }
                daily.merge(detail.getWorkDate(), detail.getHours(), BigDecimal::add);
            }
            if (detail.getHours().signum() > 0) {
                detail.setCostingAmount(amount(detail.getCostingRate(), detail.getHours()));
                detail.setBillingAmount(Integer.valueOf(1).equals(detail.getBillableFlag()) ? amount(detail.getBillingRate(), detail.getHours()) : BigDecimal.ZERO.setScale(2));
            }
        }
        BigDecimal limit = new BigDecimal(config.getConfigValue("sys.oa.timesheet.maxDailyHours", "24"));
        if (limit.signum() <= 0 || limit.compareTo(BigDecimal.valueOf(24)) > 0) throw new IllegalStateException("单日工时上限配置必须大于0且不超过24小时");
        for (Map.Entry<LocalDate, BigDecimal> day : daily.entrySet()) {
            if (day.getValue().compareTo(limit) > 0) throw new IllegalArgumentException(day.getKey() + "累计工时超过" + limit + "小时");
            rules.evaluateWarn("oa.timesheet.daily-hours", "TIMESHEET", sheet.getTimesheetId(), day.getValue(), false, day.getKey() + "工时较长，请核对");
        }
        sheet.setTotalHours(OaRecordSupport.decimal(details.stream().map(OaTimesheetDetail::getHours).reduce(BigDecimal.ZERO, BigDecimal::add), 8, 2, true, "总工时"));
        sheet.setBillableHours(OaRecordSupport.decimal(details.stream().filter(item -> Integer.valueOf(1).equals(item.getBillableFlag())).map(OaTimesheetDetail::getHours).reduce(BigDecimal.ZERO, BigDecimal::add), 8, 2, true, "计费工时"));
        sheet.setCostingAmount(OaRecordSupport.decimal(details.stream().map(item -> OaRecordSupport.zero(item.getCostingAmount())).reduce(BigDecimal.ZERO, BigDecimal::add), 18, 2, true, "成本金额"));
        sheet.setBillingAmount(OaRecordSupport.decimal(details.stream().map(item -> OaRecordSupport.zero(item.getBillingAmount())).reduce(BigDecimal.ZERO, BigDecimal::add), 18, 2, true, "计费金额"));
    }

    private void prepareReversal(OaTimesheet sheet, OaTimesheetDetail detail, OaIdentityReference employee, Map<Long, OaTimesheetReversalTotals> reversals) {
        OaRecordSupport.require(detail.getReversalOfDetailId(), "负数工时必须关联原已审批明细");
        OaTimesheetDetail original = OaRecordSupport.active(detailsMapper.selectForUpdate(detail.getReversalOfDetailId(), OaRecordSupport.tenantId()));
        OaTimesheet source = OaRecordSupport.active(sheets.selectById(original.getTimesheetId()));
        if (!"APPROVED".equals(source.getStatus()) || original.getHours().signum() <= 0) throw new IllegalArgumentException("只能冲正已审批的正数工时");
        OaRecordSupport.same(source.getEmployeeId(), employee.getId(), "只能冲正本人工时");
        OaRecordSupport.same(original.getProjectId(), detail.getProjectId(), "冲正项目必须与原明细一致");
        OaRecordSupport.same(original.getTaskId(), detail.getTaskId(), "冲正任务必须与原明细一致");
        OaRecordSupport.same(original.getActivityTypeId(), detail.getActivityTypeId(), "冲正活动类型必须与原明细一致");
        OaRecordSupport.same(original.getWorkDate(), detail.getWorkDate(), "冲正工作日期必须与原明细一致");
        OaTimesheetReversalTotals reserved = reversals.computeIfAbsent(original.getDetailId(), id -> query.reversalTotals(OaRecordSupport.tenantId(), id, sheet.getTimesheetId()));
        detail.setCostingRate(OaRecordSupport.require(original.getCostingRate(), "原工时成本快照缺失")); detail.setBillingRate(OaRecordSupport.require(original.getBillingRate(), "原工时计费快照缺失"));
        detail.setBillableFlag(original.getBillableFlag()); detail.setFromTime(null); detail.setToTime(null);
        detail.setCostingAmount(OaTimesheetAmountCalculator.reversal(OaRecordSupport.require(original.getCostingAmount(), "原工时成本金额缺失"), original.getCostingRate(), original.getHours(), reserved.getHours(), reserved.getCostingAmount(), detail.getHours().abs()));
        detail.setBillingAmount(OaTimesheetAmountCalculator.reversal(OaRecordSupport.require(original.getBillingAmount(), "原工时计费金额缺失"), Integer.valueOf(1).equals(original.getBillableFlag()) ? original.getBillingRate() : BigDecimal.ZERO, original.getHours(), reserved.getHours(), reserved.getBillingAmount(), detail.getHours().abs()));
        reserved.setHours(reserved.getHours().add(detail.getHours().abs())); reserved.setCostingAmount(reserved.getCostingAmount().subtract(detail.getCostingAmount())); reserved.setBillingAmount(reserved.getBillingAmount().subtract(detail.getBillingAmount()));
    }

    private BigDecimal amount(BigDecimal rate, BigDecimal hours) {
        return rate == null ? null : OaRecordSupport.decimal(rate.multiply(hours).setScale(2, RoundingMode.HALF_UP), 18, 2, true, "工时金额");
    }
}

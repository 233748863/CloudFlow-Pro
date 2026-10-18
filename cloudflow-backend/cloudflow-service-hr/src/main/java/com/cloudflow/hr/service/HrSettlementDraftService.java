package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.hr.client.vo.HrEmployeeAssetRecovery;
import com.cloudflow.hr.domain.dto.HrHRequests;
import com.cloudflow.hr.domain.dto.HrSettlementRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrFinalSettlement;
import com.cloudflow.hr.domain.entity.HrFinalSettlementItem;
import com.cloudflow.hr.domain.entity.HrLifecycleApplication;
import com.cloudflow.hr.domain.entity.HrSeveranceRule;
import com.cloudflow.hr.domain.vo.settlement.HrSettlementView;
import com.cloudflow.hr.mapper.HrEmployeeAdvanceMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementItemMapper;
import com.cloudflow.hr.mapper.HrFinalSettlementMapper;
import com.cloudflow.hr.mapper.HrLifecycleApplicationMapper;
import com.cloudflow.hr.mapper.HrSeveranceRuleMapper;
import com.cloudflow.hr.service.HrSettlementCalculation.SamplingSelection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static com.cloudflow.hr.service.HrHException.conflict;
import static com.cloudflow.hr.service.HrHException.invalid;
import static com.cloudflow.hr.service.HrRuleSupport.tenantId;
import static com.cloudflow.hr.service.HrRuleSupport.userName;

/** Mutable draft collection only. Source reservation, approval and posting are separate operations. */
@Service
@RequiredArgsConstructor
public class HrSettlementDraftService {
    private static final Set<String> APPROVED_EXIT = Set.of("APPROVED", "ACCEPTED", "EFFECTIVE", "COMPLETED");
    private final HrFinalSettlementMapper settlements;
    private final HrFinalSettlementItemMapper items;
    private final HrLifecycleApplicationMapper applications;
    private final HrSeveranceRuleMapper rules;
    private final HrEmployeeAdvanceMapper employees;
    private final HrSettlementAdvanceSource advances;
    private final HrSettlementTrainingSource training;
    private final HrSettlementLeaveSource leave;
    private final HrSettlementAssetSource assets;
    private final HrSettlementAssetAssessmentService assetAssessments;
    private final HrSettlementCompensationSource compensation;
    private final HrSettlementReversalSourceService reversals;
    private final HrHSupport access;
    private final HrRuleSupport support;
    private final ObjectMapper json;

    public PageResult<HrSettlementView> list(HrSettlementRequests.Query query) {
        access.permission("hr:settlement:list"); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        List<Long> employeeIds = access.scopedEmployees(query, false);
        if (employeeIds.isEmpty()) return new PageResult<>(List.of(), 0L, query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<HrFinalSettlement> filter = new LambdaQueryWrapper<HrFinalSettlement>()
                .eq(HrFinalSettlement::getTenantId, tenantId()).in(HrFinalSettlement::getEmployeeId, employeeIds)
                .eq(query.getStatus() != null, HrFinalSettlement::getStatus, query.getStatus());
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) filter.like(HrFinalSettlement::getSettlementNo, query.getKeyword().trim());
        // Keep potentially large source/approval histories out of MySQL's filesort buffer.
        Page<HrFinalSettlement> page = settlements.selectPage(new Page<>(query.getPageNum(), query.getPageSize()),
                filter.select(HrFinalSettlement::getSettlementId).orderByDesc(HrFinalSettlement::getSettlementId));
        List<Long> identifiers = page.getRecords().stream().map(HrFinalSettlement::getSettlementId).toList();
        Map<Long, HrFinalSettlement> records = new LinkedHashMap<>();
        if (!identifiers.isEmpty()) {
            // Reapply tenant and employee scope while hydrating, without sorting the JSON columns.
            List<HrFinalSettlement> fetched = settlements.selectList(new LambdaQueryWrapper<HrFinalSettlement>()
                    .eq(HrFinalSettlement::getTenantId, tenantId()).in(HrFinalSettlement::getEmployeeId, employeeIds)
                    .in(HrFinalSettlement::getSettlementId, identifiers));
            for (HrFinalSettlement record : fetched) records.put(record.getSettlementId(), record);
        }
        List<HrSettlementView> result = identifiers.stream().map(records::get).filter(Objects::nonNull).map(this::view).toList();
        return new PageResult<>(result, page.getTotal(), page.getCurrent(), page.getSize());
    }

    public HrSettlementView detail(Long id) { return view(visible(id, "hr:settlement:list")); }

    public PageResult<HrSettlementView.PolicyOption> policies(Long id, HrSettlementRequests.Query query) {
        HrFinalSettlement record = visible(id, "hr:settlement:edit"); access.operator(record.getEmployeeId(), "hr:settlement:edit"); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        LambdaQueryWrapper<HrSeveranceRule> filter = new LambdaQueryWrapper<HrSeveranceRule>()
                .eq(HrSeveranceRule::getTenantId, tenantId()).eq(HrSeveranceRule::getDeleted, 0).eq(HrSeveranceRule::getStatus, "CONFIRMED")
                .le(HrSeveranceRule::getEffectiveFrom, record.getRelievingDate())
                .and(dates -> dates.isNull(HrSeveranceRule::getEffectiveTo).or().ge(HrSeveranceRule::getEffectiveTo, record.getRelievingDate()));
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) filter.and(names -> names.like(HrSeveranceRule::getRuleName, query.getKeyword().trim()).or().like(HrSeveranceRule::getRuleCode, query.getKeyword().trim()));
        Page<HrSeveranceRule> page = rules.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), filter.orderByDesc(HrSeveranceRule::getRuleId));
        return new PageResult<>(page.getRecords().stream().map(rule -> new HrSettlementView.PolicyOption(rule.getRuleId(), rule.getRuleName() + " · " + rule.getRuleCode())).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public PageResult<HrSettlementView.Option> applications(HrSettlementRequests.Query query) {
        access.permission("hr:settlement:add"); access.validate(query);
        if (query.getPageNum() == null || query.getPageSize() == null) throw invalid("分页参数不能为空");
        List<Long> employeeIds = access.scopedEmployees(query, false).stream().filter(id -> !access.owner(id)).toList();
        if (employeeIds.isEmpty()) return new PageResult<>(List.of(), 0L, query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<HrLifecycleApplication> filter = new LambdaQueryWrapper<HrLifecycleApplication>()
                .eq(HrLifecycleApplication::getTenantId, tenantId()).eq(HrLifecycleApplication::getDeleted, 0)
                .eq(HrLifecycleApplication::getType, "RESIGNATION").in(HrLifecycleApplication::getStatus, APPROVED_EXIT)
                .in(HrLifecycleApplication::getEmployeeId, employeeIds);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) filter.like(HrLifecycleApplication::getApplicationNo, query.getKeyword().trim());
        Page<HrLifecycleApplication> page = applications.selectPage(new Page<>(query.getPageNum(), query.getPageSize()), filter.orderByDesc(HrLifecycleApplication::getId));
        return new PageResult<>(page.getRecords().stream().map(row -> new HrSettlementView.Option(row.getId(),
                row.getApplicationNo() + " · " + access.employee(row.getEmployeeId()).getName(), row.getEmployeeId(), row.getEffectiveDate())).toList(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    public Long create(HrSettlementRequests.Create input) {
        access.permission("hr:settlement:add"); access.validate(input);
        HrLifecycleApplication initial = application(input.getLifecycleApplicationId()); access.operator(initial.getEmployeeId(), "hr:settlement:add");
        try {
            return support.transaction(() -> {
                lockEmployee(initial.getEmployeeId());
                if (applications.lockForUpdate(tenantId(), initial.getId()) == null) throw invalid("离职申请不存在");
                HrLifecycleApplication current = application(initial.getId());
                if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId())) throw conflict("SETTLEMENT_SOURCE_CHANGED", "离职申请所属员工已变化");
                HrEmployee employee = access.employee(current.getEmployeeId()); validateDates(employee, current);
                HrFinalSettlement record = new HrFinalSettlement(); record.setTenantId(tenantId()); record.setEmployeeId(employee.getId());
                record.setLifecycleApplicationId(current.getId()); record.setSettlementNo("HRS" + UUID.randomUUID().toString().replace("-", ""));
                record.setSettlementKind("NORMAL"); record.setSupersededFlag(0); record.setJoinDate(employee.getHireDate()); record.setRelievingDate(current.getEffectiveDate());
                record.setStatus("DRAFT"); record.setApprovalStatus("DRAFT"); record.setVersion(0); record.setRemark(input.getRemark());
                record.setCreateBy(userName()); record.setUpdateBy(userName()); record.setCreateTime(HrHSupport.now()); record.setUpdateTime(HrHSupport.now());
                record.setCalculationSnapshot(json.createObjectNode().put("schemaVersion", 1).put("lifecycleVersion", current.getVersion())); clearCalculation(record);
                if (settlements.insert(record) != 1 || record.getSettlementId() == null) throw conflict("SETTLEMENT_SAVE_FAILED", "结算草稿未保存");
                audit(record, "CREATE"); return record.getSettlementId();
            });
        } catch (DuplicateKeyException failure) { throw conflict("SETTLEMENT_ALREADY_EXISTS", "本次离职已有有效结算单，请查询原单"); }
    }

    public void update(Long id, HrSettlementRequests.Update input) {
        access.permission("hr:settlement:edit"); access.validate(input);
        SamplingSelection selected = input.getSampling() == null ? null : selection(input.getSampling());
        locked(id, "hr:settlement:edit", input.getVersion(), record -> {
            requireSource(record); validateRule(input.getRuleId(), record); record.setRuleId(input.getRuleId()); record.setRemark(input.getRemark());
            ObjectNode snapshot = snapshot(record);
            if (selected == null) snapshot.remove("sampling");
            else {
                ObjectNode sampling = json.createObjectNode(); sampling.set("months", json.valueToTree(selected.months().stream().map(YearMonth::toString).toList()));
                sampling.put("averagingMonths", selected.averagingMonths().toPlainString()); sampling.put("reason", selected.reason());
                sampling.put("reviewedBy", access.user().toString()); sampling.put("reviewedTime", HrHSupport.now().toString());
                sampling.put("joinDate", record.getJoinDate().toString()); sampling.put("relievingDate", record.getRelievingDate().toString());
                for (YearMonth month : selected.months()) if (month.isBefore(YearMonth.from(record.getJoinDate())) || month.isAfter(YearMonth.from(record.getRelievingDate()))) throw invalid("取样月份须位于本次在职期间");
                snapshot.set("sampling", sampling);
            }
            record.setCalculationSnapshot(snapshot); clearCalculation(record); persist(record); audit(record, "UPDATE"); return null;
        });
    }

    public HrSettlementView refreshSource(Long id, HrHRequests.VersionDTO input) {
        access.permission("hr:settlement:edit"); access.validate(input);
        return locked(id, "hr:settlement:edit", input.getVersion(), record -> {
            HrLifecycleApplication current = lockedApplication(record); HrEmployee employee = access.employee(record.getEmployeeId()); validateDates(employee, current);
            if (!Objects.equals(current.getEmployeeId(), record.getEmployeeId())) throw conflict("SETTLEMENT_SOURCE_CHANGED", "离职申请所属员工已变化，不能替换本单员工");
            if (Objects.equals(current.getEffectiveDate(), record.getRelievingDate()) && Objects.equals(employee.getHireDate(), record.getJoinDate())) return view(record);
            ObjectNode snapshot = snapshot(record); ObjectNode change = json.createObjectNode();
            change.put("previousJoinDate", record.getJoinDate().toString()); change.put("previousRelievingDate", record.getRelievingDate().toString());
            change.put("reviewedBy", access.user().toString()); change.put("reviewedTime", HrHSupport.now().toString());
            snapshot.set("sourceRefresh", change); snapshot.put("lifecycleVersion", current.getVersion()); snapshot.remove("sampling");
            record.setJoinDate(employee.getHireDate()); record.setRelievingDate(current.getEffectiveDate()); record.setRuleId(null); record.setCalculationSnapshot(snapshot);
            for (HrFinalSettlementItem source : rows(id)) {
                if (!"OA_ASSET".equals(source.getSourceBizType())) continue;
                ObjectNode evidence = source.getSourceSnapshot() instanceof ObjectNode value ? value.deepCopy() : json.createObjectNode();
                source.setSourceSnapshot(assetAssessments.merge(record, evidence, evidence)); source.setConfirmedFlag(0);
                source.setUpdateBy(userName()); source.setUpdateTime(HrHSupport.now());
                if (items.updateById(source) != 1) throw conflict("SETTLEMENT_ITEM_SAVE_FAILED", "来源日期变化后的资产核定未更新");
            }
            clearCalculation(record); persist(record); audit(record, "REFRESH_SOURCE"); return view(record);
        });
    }

    private void validateRule(Long id, HrFinalSettlement settlement) {
        if (id == null) return;
        HrSeveranceRule rule = rules.selectById(id);
        if (rule == null || !Objects.equals(rule.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(rule.getDeleted())) throw invalid("请选择本租户可见的补偿政策");
        if (!"CONFIRMED".equals(rule.getStatus()) || rule.getConfirmedBy() == null || rule.getConfirmedTime() == null) throw invalid("请选择已核定的补偿政策");
        if (rule.getEffectiveFrom() == null || settlement.getRelievingDate().isBefore(rule.getEffectiveFrom()) || rule.getEffectiveTo() != null && settlement.getRelievingDate().isAfter(rule.getEffectiveTo())) throw invalid("所选政策未覆盖本单离职日期");
    }

    public ObjectNode assetObservation(Long id, Long itemId) {
        HrFinalSettlement record = visible(id, "hr:settlement:edit");
        HrFinalSettlementItem source = assetRow(record, itemId);
        return assetAssessments.inspect(record.getEmployeeId(), Long.valueOf(source.getSourceBizId()), "hr:settlement:edit");
    }

    public HrSettlementView reviewAsset(Long id, Long itemId, HrSettlementRequests.AssetReview input) {
        access.permission("hr:settlement:edit"); access.validate(input);
        return locked(id, "hr:settlement:edit", input.getVersion(), record -> {
            requireSource(record); HrFinalSettlementItem source = assetRow(record, itemId);
            ObjectNode current = assetAssessments.inspect(record.getEmployeeId(), Long.valueOf(source.getSourceBizId()), "hr:settlement:edit");
            ObjectNode reviewed = assetAssessments.assess(record, current, source.getSourceSnapshot(), input);
            source.setSourceSnapshot(reviewed); source.setAmount(assetAssessments.amount(reviewed)); source.setConfirmedFlag(reviewed.path("assessmentCurrent").asBoolean(false) ? 1 : 0);
            source.setUpdateBy(userName()); source.setUpdateTime(HrHSupport.now());
            if (items.updateById(source) != 1) throw conflict("SETTLEMENT_ITEM_SAVE_FAILED", "资产核定未保存");
            clearCalculation(record); persist(record); audit(record, "ASSET_REVIEW"); return view(record);
        });
    }

    private HrFinalSettlementItem assetRow(HrFinalSettlement record, Long itemId) {
        HrFinalSettlementItem source = itemId == null ? null : items.selectById(itemId);
        if (source == null || !Objects.equals(source.getTenantId(), tenantId()) || !Objects.equals(source.getSettlementId(), record.getSettlementId())
                || !"OA_ASSET".equals(source.getSourceBizType()) || !"ASSET".equals(source.getItemType()) || source.getSourceBizId() == null || !source.getSourceBizId().matches("[1-9][0-9]{0,18}")) throw invalid("请选择本单已汇集的资产明细");
        return source;
    }

    public HrSettlementView calculate(Long id, HrHRequests.VersionDTO input) {
        access.permission("hr:settlement:calculate"); access.validate(input);
        return locked(id, "hr:settlement:calculate", input.getVersion(), record -> {
            requireSource(record);
            CollectionResult current = collect(record);
            List<HrFinalSettlementItem> collected = current.items();
            replaceDraftItems(record, collected);
            record.setWorkYears(current.workYears());
            record.setTotalPayable(total(collected, "PAYABLE")); record.setTotalReceivable(total(collected, "RECEIVABLE"));
            record.setSeveranceAmount(total(collected, "SEVERANCE")); record.setAssetRecoveryCost(total(collected, "ASSET"));
            record.setNetAmount(HrSettlementCalculation.net(record.getTotalPayable(), record.getSeveranceAmount(), record.getTotalReceivable(), record.getAssetRecoveryCost()));
            ObjectNode snapshot = snapshot(record); snapshot.put("calculated", true); snapshot.put("calculatedBy", access.user().toString()); snapshot.put("calculatedTime", HrHSupport.now().toString());
            snapshot.set("missingRequirements", json.valueToTree(current.missing())); snapshot.set("compensation", current.compensation());
            snapshot.set("rounding", json.valueToTree(HrSettlementCalculation.roundingSnapshot())); record.setCalculationSnapshot(snapshot);
            persist(record); audit(record, "CALCULATE"); return view(record);
        });
    }

    /** Caller must hold the employee, settlement and source locks until reservation and submission commit. */
    void verifySubmissionLocked(HrFinalSettlement record) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || record == null || !Objects.equals(tenantId(), record.getTenantId())) {
            throw conflict("SETTLEMENT_TRANSACTION_REQUIRED", "须在已锁定结算来源的事务内复核提交");
        }
        access.operator(record.getEmployeeId(), HrSettlementReversalSourceService.submissionPermission(record));
        verifyReadyLocked(record, false);
    }

    /** Approval remains immutable; fresh source checks may reject confirmation but never rewrite the approved amounts. */
    void verifyConfirmationLocked(HrFinalSettlement record) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || record == null || !Objects.equals(tenantId(), record.getTenantId())) {
            throw conflict("SETTLEMENT_TRANSACTION_REQUIRED", "须在已锁定结算来源的事务内复核确认");
        }
        access.operator(record.getEmployeeId(), "hr:settlement:confirm");
        verifyReadyLocked(record, true);
    }

    private void verifyReadyLocked(HrFinalSettlement record, boolean approved) {
        if ("REVERSAL".equals(record.getSettlementKind())) { reversals.verifyReadyLocked(record, approved); return; }
        ObjectNode snapshot = snapshot(record);
        if (!"NORMAL".equals(record.getSettlementKind()) || !Integer.valueOf(0).equals(record.getSupersededFlag())
                || !"DRAFT".equals(record.getStatus()) || !(approved ? "APPROVED".equals(record.getApprovalStatus()) : Set.of("DRAFT", "REJECTED", "CANCELLED").contains(String.valueOf(record.getApprovalStatus())))
                || record.getConfirmedTime() != null || record.getPaymentRequestId() != null
                || !snapshot.path("calculated").asBoolean(false) || !snapshot.path("missingRequirements").isArray()
                || !snapshot.path("missingRequirements").isEmpty() || record.getRuleId() == null) throw submissionChanged();
        requireSource(record);
        if (rules.lock(tenantId(), record.getRuleId()) == null) throw submissionChanged();
        CollectionResult current = collect(record);
        List<HrFinalSettlementItem> saved = rows(record.getSettlementId());
        if (!current.missing().isEmpty() || saved.stream().anyMatch(item -> !Integer.valueOf(0).equals(item.getSourcePostedFlag()))
                || !sameEvidence(snapshot.path("compensation"), approved ? compensationBeforeFreeze(record, current.compensation()) : current.compensation())
                || !sameEvidence(snapshot.path("rounding"), json.valueToTree(HrSettlementCalculation.roundingSnapshot()))
                || !sameAmount(record.getWorkYears(), current.workYears())) throw submissionChanged();
        Map<String, HrFinalSettlementItem> expected = new LinkedHashMap<>();
        for (HrFinalSettlementItem item : current.items()) {
            if (!Integer.valueOf(1).equals(item.getConfirmedFlag()) || expected.putIfAbsent(item.getSourceBizType() + ":" + item.getSourceBizId(), item) != null) throw submissionChanged();
        }
        for (HrFinalSettlementItem item : saved) {
            if (item.getSourceSnapshot() == null || !item.getSourceSnapshot().path("active").asBoolean(false)) continue;
            HrFinalSettlementItem actual = expected.remove(item.getSourceBizType() + ":" + item.getSourceBizId());
            if (actual == null || !Integer.valueOf(1).equals(item.getConfirmedFlag()) || !Objects.equals(item.getItemType(), actual.getItemType())
                    || !sameAmount(item.getAmount(), actual.getAmount()) || !(approved && Set.of("HR_SALARY_SLIP", "HR_ADVANCE", "HR_LEAVE_QUOTA", "HR_TRAINING_RECOVERY").contains(item.getSourceBizType()))
                        && !sameEvidence(item.getSourceSnapshot(), approved && "HR_SEVERANCE".equals(item.getSourceBizType()) ? compensationBeforeFreeze(record, actual.getSourceSnapshot()) : actual.getSourceSnapshot())) throw submissionChanged();
        }
        if (!expected.isEmpty() || !sameAmount(record.getTotalPayable(), total(current.items(), "PAYABLE"))
                || !sameAmount(record.getTotalReceivable(), total(current.items(), "RECEIVABLE"))
                || !sameAmount(record.getSeveranceAmount(), total(current.items(), "SEVERANCE"))
                || !sameAmount(record.getAssetRecoveryCost(), total(current.items(), "ASSET"))
                || !sameAmount(record.getNetAmount(), HrSettlementCalculation.net(record.getTotalPayable(), record.getSeveranceAmount(), record.getTotalReceivable(), record.getAssetRecoveryCost()))) throw submissionChanged();
    }

    private static boolean sameAmount(BigDecimal saved, BigDecimal current) { return saved != null && current != null && saved.compareTo(current) == 0; }

    /** Freezing an unpaid sampled wage increments only its row version; financial evidence stays immutable. */
    private JsonNode compensationBeforeFreeze(HrFinalSettlement record, JsonNode current) {
        JsonNode comparable = current.deepCopy(); JsonNode snapshot = record.getCalculationSnapshot();
        for (JsonNode wage : comparable.path("salarySampling").path("wages")) {
            String salaryId = wage.path("salarySlipId").asText();
            JsonNode frozen = snapshot.path("reservation").path("sources").path("HR_SALARY_SLIP:" + salaryId).path("evidence");
            if (frozen.isMissingNode()) continue;
            List<JsonNode> originals = new ArrayList<>();
            for (JsonNode original : snapshot.path("compensation").path("salarySampling").path("wages")) {
                if (salaryId.equals(original.path("salarySlipId").asText())) originals.add(original);
            }
            if (originals.size() != 1 || !(wage instanceof ObjectNode value)) throw submissionChanged();
            JsonNode original = originals.get(0);
            if (!original.path("version").isIntegralNumber() || !frozen.path("version").isIntegralNumber() || !wage.path("version").isIntegralNumber()
                    || original.path("version").longValue() + 1 != frozen.path("version").longValue()
                    || wage.path("version").longValue() != frozen.path("version").longValue()
                    || !original.path("digestSha256").equals(frozen.path("digestSha256")) || !wage.path("digestSha256").equals(original.path("digestSha256"))) throw submissionChanged();
            value.set("version", original.get("version"));
        }
        return comparable;
    }

    /** Captures this submission only; previous workflow rounds are kept separately to avoid recursive history. */
    ObjectNode submissionEvidenceLocked(HrFinalSettlement record) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || !Objects.equals(tenantId(), record.getTenantId())) throw conflict("SETTLEMENT_TRANSACTION_REQUIRED", "须在结算事务内保存提交依据");
        ObjectNode evidence = json.valueToTree(record);
        ObjectNode calculation = snapshot(record); calculation.remove(List.of("workflow", "workflowHistory", "reservation", "reservationHistory"));
        evidence.set("calculationSnapshot", calculation);
        evidence.set("items", json.valueToTree(rows(record.getSettlementId()).stream()
                .filter(item -> item.getSourceSnapshot() != null && item.getSourceSnapshot().path("active").asBoolean(false)).toList()));
        return evidence;
    }

    private static boolean sameEvidence(JsonNode saved, JsonNode current) {
        return saved != null && current != null && saved.equals((left, right) -> left.isNumber() && right.isNumber()
                ? left.decimalValue().compareTo(right.decimalValue()) : left.equals(right) ? 0 : 1, current);
    }
    private static HrHException submissionChanged() { return conflict("SETTLEMENT_SUBMISSION_CHANGED", "结算核定、来源或金额已变化，请重新核定并计算后提交"); }

    private CollectionResult collect(HrFinalSettlement record) {
            Long id = record.getSettlementId(); List<String> missing = new ArrayList<>(); List<HrFinalSettlementItem> collected = new ArrayList<>();
            HrSettlementAdvanceSource.Inspection loans = advances.inspect(record.getEmployeeId(), record.getRelievingDate(), id);
            missing.addAll(loans.issues().stream().map(HrSettlementAdvanceSource.Issue::message).toList());
            for (HrSettlementPayrollSource.Wage wage : loans.payroll().unpaid()) collected.add(item(record, wage.itemType(), "未付工资", "HR_SALARY_SLIP", wage.salarySlipId().toString(), new BigDecimal(wage.amount()), wage.evidence(), true));
            for (HrSettlementAdvanceSource.Loan loan : loans.loans()) collected.add(item(record, "RECEIVABLE", "未还借款", "HR_ADVANCE", loan.advanceId().toString(), new BigDecimal(loan.amount()), loan.evidence(), true));
            HrSettlementTrainingSource.Inspection recoveries = training.inspect(record.getEmployeeId(), id);
            missing.addAll(recoveries.issues().stream().map(HrSettlementTrainingSource.Issue::message).toList());
            for (HrSettlementTrainingSource.Recovery recovery : recoveries.recoveries()) collected.add(item(record, "RECEIVABLE", "核定培训追偿", "HR_TRAINING_RECOVERY", recovery.recoveryId().toString(), new BigDecimal(recovery.amount()), recovery.evidence(), true));
            SamplingSelection selection = savedSelection(record);
            HrSettlementCompensationSource.Inspection calculation = compensation.inspect(record.getEmployeeId(), record.getRelievingDate(), record.getRuleId(), selection);
            missing.addAll(calculation.issues());
            if (calculation.result() != null) {
                collected.add(item(record, "SEVERANCE", "经济补偿", "HR_SEVERANCE", record.getRuleId().toString(), calculation.result().severanceAmount(), calculation.evidence(), true));
            }
            HrSettlementLeaveSource.Inspection balances = leave.inspect(record.getEmployeeId(), record.getRelievingDate(), id);
            missing.addAll(balances.issues().stream().map(HrSettlementLeaveSource.Issue::message).toList());
            for (HrSettlementLeaveSource.Leave balance : balances.leaves()) {
                BigDecimal amount = BigDecimal.ZERO; boolean confirmed = false;
                try { amount = calculation.leaveCash(balance.unit(), new BigDecimal(balance.quantity())); confirmed = true; }
                catch (IllegalArgumentException | HrHException failure) { missing.add(failure.getMessage()); }
                ObjectNode evidence = balance.evidence().deepCopy(); evidence.set("valuation", calculation.evidence());
                collected.add(item(record, "PAYABLE", "假期余额折现", "HR_LEAVE_QUOTA", balance.quotaId().toString(), amount, evidence, confirmed));
            }
            collectAssets(record, collected, missing);
            return new CollectionResult(List.copyOf(collected), missing.stream().distinct().toList(), calculation.evidence(),
                    calculation.result() == null ? BigDecimal.ZERO : calculation.result().displayWorkYears());
    }

    private record CollectionResult(List<HrFinalSettlementItem> items, List<String> missing, JsonNode compensation, BigDecimal workYears) { }

    private void collectAssets(HrFinalSettlement record, List<HrFinalSettlementItem> collected, List<String> missing) {
        Map<String, HrFinalSettlementItem> previous = new LinkedHashMap<>();
        for (HrFinalSettlementItem source : rows(record.getSettlementId())) if ("OA_ASSET".equals(source.getSourceBizType())) previous.put(source.getSourceBizId(), source);
        Map<String, JsonNode> sources = new LinkedHashMap<>();
        previous.forEach((id, source) -> sources.put(id, source.getSourceSnapshot()));
        try {
            for (HrEmployeeAssetRecovery.Asset asset : assets.outstanding(record.getEmployeeId())) sources.put(asset.assetId().toString(), json.valueToTree(asset));
        } catch (HrHException failure) { if (failure.getStatus() == 403) throw failure; missing.add(failure.getMessage()); }
        for (Map.Entry<String, JsonNode> entry : sources.entrySet()) {
            HrFinalSettlementItem original = previous.get(entry.getKey()); ObjectNode evidence;
            try { evidence = assetAssessments.inspect(record.getEmployeeId(), Long.valueOf(entry.getKey()), "hr:settlement:calculate"); }
            catch (HrHException failure) {
                if (failure.getStatus() == 403) throw failure;
                evidence = entry.getValue() instanceof ObjectNode value ? value.deepCopy() : json.createObjectNode();
                evidence.put("sourceVerified", false); missing.add(failure.getMessage());
            }
            evidence = assetAssessments.merge(record, evidence, original == null ? null : original.getSourceSnapshot());
            boolean confirmed = evidence.path("assessmentCurrent").asBoolean(false);
            if (!confirmed) missing.add("资产" + evidence.path("assetCode").asText(entry.getKey()) + "尚待核定或来源变化后重新核定");
            String name = evidence.path("name").asText("待核实资产");
            collected.add(item(record, "ASSET", name, "OA_ASSET", entry.getKey(), assetAssessments.amount(evidence), evidence, confirmed));
        }
    }

    private HrFinalSettlementItem item(HrFinalSettlement record, String type, String name, String source, String sourceId, BigDecimal amount, JsonNode evidence, boolean confirmed) {
        HrFinalSettlementItem item = new HrFinalSettlementItem(); item.setTenantId(tenantId()); item.setSettlementId(record.getSettlementId());
        item.setItemType(type); item.setItemName(name.length() > 200 ? name.substring(0, 200) : name); item.setSourceBizType(source); item.setSourceBizId(sourceId);
        item.setAmount(HrSettlementCalculation.signedMoney(amount)); item.setConfirmedFlag(confirmed ? 1 : 0); item.setSourcePostedFlag(0);
        ObjectNode snapshot = evidence instanceof ObjectNode object ? object.deepCopy() : json.createObjectNode(); snapshot.put("active", true); item.setSourceSnapshot(snapshot);
        item.setCreateBy(userName()); item.setUpdateBy(userName()); item.setCreateTime(HrHSupport.now()); item.setUpdateTime(HrHSupport.now()); return item;
    }

    private void replaceDraftItems(HrFinalSettlement record, List<HrFinalSettlementItem> replacement) {
        Map<String, HrFinalSettlementItem> existing = new LinkedHashMap<>();
        for (HrFinalSettlementItem old : rows(record.getSettlementId())) {
            if (Integer.valueOf(1).equals(old.getSourcePostedFlag())) throw conflict("SETTLEMENT_ALREADY_POSTED", "已入账来源不能重算");
            existing.put(old.getSourceBizType() + ":" + old.getSourceBizId(), old);
        }
        Set<String> unique = new java.util.HashSet<>();
        for (HrFinalSettlementItem next : replacement) {
            String key = next.getSourceBizType() + ":" + next.getSourceBizId();
            if (!unique.add(key)) throw conflict("SETTLEMENT_SOURCE_DUPLICATE", "结算来源重复，请核实原业务记录");
            HrFinalSettlementItem previous = existing.remove(key);
            if (previous == null) { if (items.insert(next) != 1) throw conflict("SETTLEMENT_ITEM_SAVE_FAILED", "结算来源未保存"); }
            else { next.setItemId(previous.getItemId()); next.setCreateBy(previous.getCreateBy()); next.setCreateTime(previous.getCreateTime()); if (items.updateById(next) != 1) throw conflict("SETTLEMENT_ITEM_SAVE_FAILED", "结算来源已变化"); }
        }
        for (HrFinalSettlementItem obsolete : existing.values()) {
            ObjectNode snapshot = obsolete.getSourceSnapshot() instanceof ObjectNode object ? object.deepCopy() : json.createObjectNode();
            snapshot.put("active", false); snapshot.put("inactiveReason", "本次重算已不再包含该来源"); obsolete.setSourceSnapshot(snapshot);
            obsolete.setConfirmedFlag(0); obsolete.setUpdateBy(userName()); obsolete.setUpdateTime(HrHSupport.now());
            if (items.updateById(obsolete) != 1) throw conflict("SETTLEMENT_ITEM_SAVE_FAILED", "旧来源状态已变化");
        }
    }

    private BigDecimal total(List<HrFinalSettlementItem> values, String type) { return HrSettlementCalculation.postedTotal(values.stream().filter(item -> type.equals(item.getItemType())).map(HrFinalSettlementItem::getAmount).toList()); }
    private List<HrFinalSettlementItem> rows(Long id) { return items.selectList(new LambdaQueryWrapper<HrFinalSettlementItem>().eq(HrFinalSettlementItem::getTenantId, tenantId()).eq(HrFinalSettlementItem::getSettlementId, id).orderByAsc(HrFinalSettlementItem::getItemId)); }
    private void clearCalculation(HrFinalSettlement record) {
        ObjectNode snapshot = snapshot(record); snapshot.put("calculated", false); snapshot.remove("compensation"); snapshot.set("missingRequirements", json.valueToTree(List.of("草稿已保存，请核定政策及取样并重新计算")));
        BigDecimal zeroMoney = new BigDecimal("0.00");
        record.setCalculationSnapshot(snapshot); record.setWorkYears(BigDecimal.ZERO); record.setTotalPayable(zeroMoney); record.setTotalReceivable(zeroMoney); record.setAssetRecoveryCost(zeroMoney); record.setSeveranceAmount(zeroMoney); record.setNetAmount(zeroMoney);
    }
    private SamplingSelection selection(HrSettlementRequests.Sampling input) {
        try { return new SamplingSelection(input.getMonths().stream().map(YearMonth::parse).toList(), input.getAveragingMonths(), input.getReason()); }
        catch (IllegalArgumentException | java.time.DateTimeException failure) { throw invalid("取样月份、平均月份数或核定原因无效"); }
    }
    private SamplingSelection savedSelection(HrFinalSettlement record) {
        JsonNode saved = snapshot(record).path("sampling"); if (saved.isMissingNode() || saved.isNull()) return null;
        if (!saved.path("joinDate").asText().equals(record.getJoinDate().toString()) || !saved.path("relievingDate").asText().equals(record.getRelievingDate().toString())
                || !saved.path("reviewedBy").asText().matches("[1-9][0-9]{0,18}") || saved.path("reviewedTime").asText().isBlank()) throw conflict("SETTLEMENT_SAMPLING_CHANGED", "取样核定记录与本次离职信息不一致");
        List<YearMonth> months = new ArrayList<>();
        try { for (JsonNode month : saved.path("months")) months.add(YearMonth.parse(month.asText())); return new SamplingSelection(months, new BigDecimal(saved.path("averagingMonths").asText()), saved.path("reason").asText()); }
        catch (IllegalArgumentException | java.time.DateTimeException failure) { throw conflict("SETTLEMENT_SAMPLING_INVALID", "已保存取样核定无法读取，请重新核定"); }
    }
    private ObjectNode snapshot(HrFinalSettlement record) { return record.getCalculationSnapshot() instanceof ObjectNode object ? object.deepCopy() : json.createObjectNode().put("schemaVersion", 1); }
    private HrSettlementView view(HrFinalSettlement record) {
        ObjectNode snapshot = snapshot(record); boolean calculated = snapshot.path("calculated").asBoolean(false); List<String> missing = new ArrayList<>(); snapshot.path("missingRequirements").forEach(node -> missing.add(node.asText()));
        if (!calculated && missing.isEmpty()) missing.add("请先核定取样并重新计算");
        List<HrSettlementView.Item> details = rows(record.getSettlementId()).stream().filter(item -> (calculated || "OA_ASSET".equals(item.getSourceBizType())) && item.getSourceSnapshot() != null && item.getSourceSnapshot().path("active").asBoolean(false)).map(item -> new HrSettlementView.Item(item.getItemId(), item.getItemType(), item.getItemName(), item.getSourceBizType(), item.getSourceBizId(), item.getAmount().toPlainString(), Integer.valueOf(1).equals(item.getConfirmedFlag()), Integer.valueOf(1).equals(item.getSourcePostedFlag()), item.getSourceSnapshot())).toList();
        HrSeveranceRule rule = record.getRuleId() == null ? null : rules.selectById(record.getRuleId());
        String ruleName = rule != null && Objects.equals(rule.getTenantId(), tenantId()) && Integer.valueOf(0).equals(rule.getDeleted()) ? rule.getRuleName() : null;
        boolean editable = !access.owner(record.getEmployeeId()) && "NORMAL".equals(record.getSettlementKind()) && Integer.valueOf(0).equals(record.getSupersededFlag()) && "DRAFT".equals(record.getStatus()) && Set.of("DRAFT", "REJECTED", "CANCELLED").contains(String.valueOf(record.getApprovalStatus())) && rows(record.getSettlementId()).stream().noneMatch(item -> Integer.valueOf(1).equals(item.getSourcePostedFlag()));
        JsonNode workflow = snapshot.path("workflow");
        boolean cancelling = workflow.path("cancelRequested").asBoolean(false);
        HrSettlementView.ApprovalProgress approval = !workflow.isObject() ? null : new HrSettlementView.ApprovalProgress(workflow.path("revision").asInt(), cancelling,
                "SUBMITTED".equals(record.getApprovalStatus()) && !cancelling && !access.owner(record.getEmployeeId()) && access.user().toString().equals(workflow.path("approval").path("applicantUserId").asText()), workflow.path("cancelOutcome").asText(null));
        boolean fundsEligible = !access.owner(record.getEmployeeId()) && Set.of("NORMAL", "REVERSAL").contains(String.valueOf(record.getSettlementKind())) && Integer.valueOf(0).equals(record.getSupersededFlag()) && "APPROVED".equals(record.getApprovalStatus());
        HrSettlementView.FundsProgress funds = new HrSettlementView.FundsProgress(record.getNetAmount().signum() > 0 ? "PAYMENT" : record.getNetAmount().signum() < 0 ? "RECEIPT" : "NETTING",
                record.getConfirmedTime() == null ? null : record.getConfirmedTime().toString(), record.getPaidTime() == null ? null : record.getPaidTime().toString(),
                record.getPaymentRequestId(), record.getSettlementProofFileId(), record.getPaidTime() == null ? null : snapshot.path("funds").path("actualDate").asText(record.getPaidTime().toLocalDate().toString()),
                snapshot.path("closure").path("time").asText(null),
                fundsEligible && "DRAFT".equals(record.getStatus()) && record.getConfirmedTime() == null && calculated && missing.isEmpty() && access.permitted("hr:settlement:confirm"),
                fundsEligible && "CONFIRMED".equals(record.getStatus()) && record.getNetAmount().signum() < 0 && record.getPaidTime() == null && access.permitted("hr:settlement:receipt"),
                fundsEligible && "PAID".equals(record.getStatus()) && record.getPaidTime() != null && access.permitted("hr:settlement:confirm"));
        boolean reverse = "REVERSAL".equals(record.getSettlementKind());
        HrFinalSettlement linked = reverse ? null : settlements.selectOne(new LambdaQueryWrapper<HrFinalSettlement>()
                .eq(HrFinalSettlement::getTenantId, tenantId()).eq(HrFinalSettlement::getReversalOfId, record.getSettlementId()));
        boolean canSubmit = !access.owner(record.getEmployeeId()) && Integer.valueOf(0).equals(record.getSupersededFlag())
                && "DRAFT".equals(record.getStatus()) && Set.of("DRAFT", "REJECTED", "CANCELLED").contains(String.valueOf(record.getApprovalStatus()))
                && calculated && missing.isEmpty() && access.permitted(HrSettlementReversalSourceService.submissionPermission(record));
        HrSettlementView.ReversalProgress reversal = new HrSettlementView.ReversalProgress(record.getReversalOfId(),
                reverse ? snapshot.path("reversal").path("originalSettlementNo").asText(null) : null, linked == null ? null : linked.getSettlementId(),
                reverse ? record.getPaidTime() != null : Integer.valueOf(1).equals(record.getSupersededFlag()),
                !reverse && linked == null && !access.owner(record.getEmployeeId()) && Integer.valueOf(0).equals(record.getSupersededFlag())
                        && Set.of("PAID", "CLOSED").contains(String.valueOf(record.getStatus())) && record.getPaidTime() != null && access.permitted("hr:settlement:reverse"));
        boolean canRemindAssets = HrSettlementAssetReminderService.eligible(record) && !access.owner(record.getEmployeeId()) && access.permitted("hr:settlement:edit");
        return new HrSettlementView(record.getSettlementId(), record.getSettlementNo(), record.getEmployeeId(), access.employee(record.getEmployeeId()).getName(), record.getLifecycleApplicationId(), record.getJoinDate(), record.getRelievingDate(), record.getRuleId(), record.getStatus(), record.getApprovalStatus(), record.getVersion(), record.getRemark(), record.getTotalPayable().toPlainString(), record.getTotalReceivable().toPlainString(), record.getAssetRecoveryCost().toPlainString(), record.getSeveranceAmount().toPlainString(), record.getNetAmount().toPlainString(), snapshot.get("sampling"), calculated, List.copyOf(missing), details, ruleName, editable, approval, funds, record.getSettlementKind(), canSubmit, reversal, canRemindAssets);
    }
    private HrFinalSettlement visible(Long id, String permission) { access.permission(permission); HrFinalSettlement record = id == null ? null : settlements.selectById(id); if (record == null || !Objects.equals(record.getTenantId(), tenantId())) throw new HrHException("SETTLEMENT_NOT_FOUND", "结算单不存在或不可见", 404); access.scope(record.getEmployeeId()); return record; }
    private HrLifecycleApplication application(Long id) { HrLifecycleApplication record = id == null ? null : applications.selectById(id); if (record == null || !Objects.equals(record.getTenantId(), tenantId()) || !Integer.valueOf(0).equals(record.getDeleted()) || !"RESIGNATION".equals(record.getType()) || !APPROVED_EXIT.contains(String.valueOf(record.getStatus())) || record.getEmployeeId() == null) throw invalid("请选择已审批通过的本租户离职申请"); return record; }
    private void validateDates(HrEmployee employee, HrLifecycleApplication application) { if (employee.getHireDate() == null || application.getEffectiveDate() == null || employee.getHireDate().getYear() < 1000 || application.getEffectiveDate().getYear() > 9999 || application.getEffectiveDate().isBefore(employee.getHireDate())) throw invalid("入职日期或离职生效日期无效"); }
    private HrLifecycleApplication lockedApplication(HrFinalSettlement record) { if (applications.lockForUpdate(tenantId(), record.getLifecycleApplicationId()) == null) throw invalid("离职申请不存在"); return application(record.getLifecycleApplicationId()); }
    private void requireSource(HrFinalSettlement record) { HrLifecycleApplication current = lockedApplication(record); HrEmployee employee = access.employee(record.getEmployeeId()); validateDates(employee, current); if (!Objects.equals(current.getEmployeeId(), record.getEmployeeId()) || !Objects.equals(current.getEffectiveDate(), record.getRelievingDate()) || !Objects.equals(employee.getHireDate(), record.getJoinDate())) throw conflict("SETTLEMENT_SOURCE_CHANGED", "离职申请或入职日期已变化，请核对离职来源后重新核定取样"); }
    private void lockEmployee(Long employeeId) { if (employees.lockEmployee(tenantId(), employeeId) == null) throw invalid("员工不存在"); }
    private <T> T locked(Long id, String permission, Integer version, Function<HrFinalSettlement, T> action) {
        HrFinalSettlement initial = visible(id, permission); access.operator(initial.getEmployeeId(), permission);
        return support.transaction(() -> {
            lockEmployee(initial.getEmployeeId()); if (settlements.lock(tenantId(), id) == null) throw invalid("结算单不存在");
            HrFinalSettlement current = visible(id, permission); HrHSupport.version(version, current.getVersion());
            if (!Objects.equals(initial.getEmployeeId(), current.getEmployeeId()) || !"NORMAL".equals(current.getSettlementKind()) || !Integer.valueOf(0).equals(current.getSupersededFlag()) || !"DRAFT".equals(current.getStatus()) || !Set.of("DRAFT", "REJECTED", "CANCELLED").contains(String.valueOf(current.getApprovalStatus()))) throw conflict("SETTLEMENT_READ_ONLY", "该结算已提交、确认或冲正，不能修改草稿");
            if (rows(id).stream().anyMatch(item -> Integer.valueOf(1).equals(item.getSourcePostedFlag()))) throw conflict("SETTLEMENT_ALREADY_POSTED", "已有入账明细的结算不能修改草稿");
            return action.apply(current);
        });
    }
    private void persist(HrFinalSettlement record) { int version = record.getVersion(); record.setUpdateBy(userName()); record.setUpdateTime(HrHSupport.now()); if (settlements.updateDraft(record, version) != 1) throw conflict("VERSION_CONFLICT", "结算已变化，请刷新后重试"); record.setVersion(version + 1); }
    private void audit(HrFinalSettlement record, String operation) { support.audit("HR_FINAL_SETTLEMENT", record.getSettlementId(), operation, Map.of("employeeId", record.getEmployeeId(), "lifecycleApplicationId", record.getLifecycleApplicationId(), "version", record.getVersion(), "status", record.getStatus(), "approvalStatus", record.getApprovalStatus())); }
}

package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.entity.HrBankCard;
import com.cloudflow.hr.domain.entity.HrBenefitPayment;
import com.cloudflow.hr.domain.entity.HrBenefitScheme;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeBenefit;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrLeavePeriod;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrMessageRecord;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrBankCardMapper;
import com.cloudflow.hr.mapper.HrBenefitPaymentMapper;
import com.cloudflow.hr.mapper.HrBenefitSchemeMapper;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.mapper.HrContractSignatureMapper;
import com.cloudflow.hr.mapper.HrEmployeeBenefitMapper;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.cloudflow.hr.mapper.HrCompComponentMapper;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrLeavePeriodMapper;
import com.cloudflow.hr.mapper.HrLeaveTypeMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrMessageRecordMapper;
import com.cloudflow.hr.service.IHrEssService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrIntegrationQueryService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrRuleSupport;
import com.cloudflow.hr.service.HrPayrollCalculationService;
import com.cloudflow.hr.service.HrPayrollComponentSnapshot;
import com.cloudflow.hr.service.HrPayrollConfigurationService;
import com.cloudflow.hr.domain.entity.HrPayrollPeriod;
import com.cloudflow.hr.mapper.HrPayrollPeriodMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrEssServiceImpl implements IHrEssService {

    private static final BigDecimal DEFAULT_PERSONAL_RATE = new BigDecimal("0.105");
    private static final BigDecimal DEFAULT_COMPANY_RATE = new BigDecimal("0.245");
    private static final Pattern PERIOD_MONTH_PATTERN = Pattern.compile("^\\d{4}-(0[1-9]|1[0-2])$");

    private final HrEssSupport essSupport;
    private final HrTypedCrudService crudService;
    private final IHrIntegrationQueryService integrationQueryService;
    private final HrSalarySlipMapper salarySlipMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrEmployeeCompMapper employeeCompMapper;
    private final HrCompComponentMapper compComponentMapper;
    private final HrEmployeeBenefitMapper employeeBenefitMapper;
    private final HrBenefitSchemeMapper benefitSchemeMapper;
    private final HrBenefitPaymentMapper benefitPaymentMapper;
    private final HrBankCardMapper bankCardMapper;
    private final HrLeaveQuotaMapper leaveQuotaMapper;
    private final HrLeavePeriodMapper leavePeriodMapper;
    private final HrLeaveTypeMapper leaveTypeMapper;
    private final HrEmployeeContractMapper employeeContractMapper;
    private final HrContractSignatureMapper contractSignatureMapper;
    private final HrCertificateRequestMapper certificateRequestMapper;
    private final HrMessageRecordMapper messageRecordMapper;
    private final ObjectMapper objectMapper;
    private final HrRuleSupport ruleSupport;
    private final HrPayrollCalculationService payrollCalculation;
    private final HrPayrollConfigurationService payrollConfiguration;
    private final HrPayrollPeriodMapper payrollPeriodMapper;
    private final com.cloudflow.hr.service.HrAdvancePayrollService advancePayroll;

    @Override
    public int generateSalarySlips(String periodMonth, Long employeeId) {
        validatePeriodMonth(periodMonth);
        Long tenantId = currentTenantId();

        QueryWrapper<HrEmployeeComp> compWrapper = new QueryWrapper<>();
        compWrapper.eq("tenant_id", tenantId).eq("deleted", 0).eq("status", "ACTIVE");
        if (employeeId != null) {
            compWrapper.eq("employee_id", employeeId);
        }
        if (employeeId != null) ruleSupport.assertEmployeeScope(employeeId);
        java.util.Set<Long> allowedEmployees = ruleSupport.employees(employeeId == null ? null : List.of(employeeId), null)
                .stream().map(com.cloudflow.hr.domain.entity.HrEmployee::getId).collect(java.util.stream.Collectors.toSet());
        List<HrEmployeeComp> comps = employeeCompMapper.selectList(compWrapper).stream()
                .filter(comp -> allowedEmployees.contains(comp.getEmployeeId())).toList();
        if (comps.isEmpty()) {
            return 0;
        }

        YearMonth month = YearMonth.parse(periodMonth);
        List<HrPayrollPeriod> periods = payrollPeriodMapper.selectList(new LambdaQueryWrapper<HrPayrollPeriod>()
                .eq(HrPayrollPeriod::getTenantId, tenantId).eq(HrPayrollPeriod::getDeleted, 0)
                .le(HrPayrollPeriod::getStartDate, month.atEndOfMonth()).ge(HrPayrollPeriod::getEndDate, month.atDay(1)));
        HrPayrollPeriod period = new HrPayrollPeriod();
        period.setStartDate(month.atDay(1)); period.setEndDate(month.atEndOfMonth()); period.setStatus("OPEN"); period.setFrequency("MONTHLY");
        if (!periods.isEmpty()) {
            if (periods.size() != 1 || !periods.get(0).getStartDate().equals(period.getStartDate()) || !periods.get(0).getEndDate().equals(period.getEndDate())) {
                throw new HrBusinessException("PAYROLL_PERIOD_MANAGED", "该月已划分薪资周期，请通过对应批次计算");
            }
            period = periods.get(0);
        }
        HrPayrollPeriod selectedPeriod = period;
        int created = 0;
        for (Long selectedEmployee : comps.stream().map(HrEmployeeComp::getEmployeeId).distinct().toList()) {
            ruleSupport.assertEmployeeScope(selectedEmployee);
            created += payrollCalculation.withGenerationLocks(selectedEmployee, selectedPeriod, () -> {
                payrollConfiguration.assertOpen(selectedPeriod.getPeriodId() == null ? selectedPeriod : payrollConfiguration.period(selectedPeriod.getPeriodId()));
                if (existsSlip(tenantId, selectedEmployee, periodMonth)) return 0;
                String error = payrollCalculation.preCheck(selectedEmployee, selectedPeriod, false);
                if (error != null) throw new HrBusinessException("PAYROLL_PRECHECK_FAILED", error);
                payrollCalculation.assertNoOverlappingSlip(selectedEmployee, selectedPeriod, null);
                HrSalarySlip slip = previewSalarySlip(selectedEmployee, selectedPeriod, false);
                salarySlipMapper.insert(slip);
                slip = advancePayroll.reserveCalculated(slip.getId());
                slip.setStatus("SUBMITTED");
                sealSalarySlip(slip);
                if (salarySlipMapper.updateById(slip) != 1) throw new HrBusinessException("SALARY_SLIP_CHANGED", "工资单已变化，请重新读取");
                ruleSupport.audit("SALARY_SLIP", slip.getId(), "GENERATE", Map.of("periodMonth", periodMonth));
                return 1;
            });
        }
        log.info("月度工资条生成完成，periodMonth: {}, tenant: {}, employees: {}, created: {}",
                periodMonth, tenantId, comps.size(), created);
        return created;
    }

    @Override
    public Long generateSalarySlipForBatch(Long employeeId, HrPayrollPeriod period, Long batchId, boolean deductUnverified) {
        return payrollCalculation.withGenerationLocks(employeeId, period, () -> {
            payrollConfiguration.assertOpen(payrollConfiguration.period(period.getPeriodId()));
            payrollCalculation.assertNoOverlappingSlip(employeeId, period, batchId);
            List<HrSalarySlip> existing = salarySlipMapper.selectList(new LambdaQueryWrapper<HrSalarySlip>()
                    .eq(HrSalarySlip::getTenantId, currentTenantId()).eq(HrSalarySlip::getEmployeeId, employeeId)
                    .eq(HrSalarySlip::getBatchId, batchId).eq(HrSalarySlip::getDeleted, 0));
            if (!existing.isEmpty()) {
                HrSalarySlip old = existing.get(0);
                if (!"DRAFT".equals(old.getStatus()) || Boolean.TRUE.equals(old.getEmployeeConfirmed())) throw new HrBusinessException("SALARY_SLIP_FINAL", "已确定工资单只能补正");
            }
            HrSalarySlip slip = previewSalarySlip(employeeId, period, deductUnverified);
            slip.setBatchId(batchId); slip.setDigestSha256(null);
            if (existing.isEmpty()) salarySlipMapper.insert(slip);
            else {
                slip.setId(existing.get(0).getId()); slip.setVersion(existing.get(0).getVersion());
                salarySlipMapper.updateById(slip);
            }
            return advancePayroll.reserveCalculated(slip.getId()).getId();
        });
    }

    @Override
    public HrSalarySlip previewSalarySlip(Long employeeId, HrPayrollPeriod period, boolean deductUnverified) {
        ruleSupport.assertEmployeeScope(employeeId);
        HrEmployeeComp comp = payrollCalculation.compensation(employeeId, period.getEndDate());
        HrSalarySlip slip = composeSlip(currentTenantId(), comp, period);
        payrollCalculation.apply(slip, period, deductUnverified);
        slip.setPayDate(period.getPayDate() == null ? period.getEndDate() : period.getPayDate());
        slip.setCreateTime(LocalDateTime.now()); slip.setUpdateTime(LocalDateTime.now()); slip.setVersion(0);
        return slip;
    }

    @Override
    public void sealSalarySlip(HrSalarySlip slip) { slip.setDigestSha256(computeDigest(slip)); }

    @Override
    public void verifySalarySlip(HrSalarySlip slip) { assertDigestValid(slip); }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirmSalarySlip(Long slipId) {
        if (slipId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "工资条 ID 不能为空");
        }
        HrSalarySlip slip = salarySlipMapper.selectById(slipId);
        if (slip == null || !Objects.equals(slip.getTenantId(), currentTenantId())) {
            throw new HrBusinessException("SLIP_NOT_FOUND", "工资条不存在：" + slipId);
        }
        essSupport.assertOwner(slip.getEmployeeId());
        if (!List.of("SUBMITTED", "PAID", "CONFIRMED").contains(slip.getStatus())) throw new HrBusinessException("SALARY_SLIP_NOT_PUBLISHED", "工资单尚未确定，暂不能确认");
        assertDigestValid(slip);
        UpdateWrapper<HrSalarySlip> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", slipId)
                .eq("tenant_id", currentTenantId())
                .set("employee_confirmed", true)
                .set("confirmed_time", LocalDateTime.now())
                .set("update_time", LocalDateTime.now());
        salarySlipMapper.update(null, wrapper);
        ruleSupport.audit("SALARY_SLIP", slipId, "EMPLOYEE_CONFIRM", Map.of());
    }

    @Override
    public PageResult<HrSalarySlip> pageMySalarySlips(PageQuery pageQuery, String periodMonth, String status) {
        QueryWrapper<HrSalarySlip> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", currentTenantId())
                .eq("employee_id", essSupport.currentEmployeeId())
                .eq("deleted", 0)
                .in("status", List.of("SUBMITTED", "PAID", "CONFIRMED"))
                .orderByDesc("period_month");
        if (StringUtils.hasText(periodMonth)) {
            wrapper.eq("period_month", periodMonth);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq("status", status);
        }
        Page<HrSalarySlip> page = salarySlipMapper.selectPage(pageQuery.build(), wrapper);
        page.getRecords().forEach(this::assertDigestValid);
        ruleSupport.audit("SALARY_SLIP", null, "READ_MINE", Map.of("employeeId", essSupport.currentEmployeeId()));
        return PageResult.build(page);
    }

    @Override
    public HrSalarySlip getMySalarySlip(Long slipId) {
        if (slipId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "工资条 ID 不能为空");
        }
        HrSalarySlip slip = salarySlipMapper.selectById(slipId);
        if (slip == null || !Objects.equals(slip.getDeleted(), 0) || !Objects.equals(slip.getTenantId(), currentTenantId())
                || !List.of("SUBMITTED", "PAID", "CONFIRMED").contains(slip.getStatus())) {
            throw new HrBusinessException("SLIP_NOT_FOUND", "工资条不存在：" + slipId);
        }
        essSupport.assertOwner(slip.getEmployeeId());
        assertDigestValid(slip);
        ruleSupport.audit("SALARY_SLIP", slipId, "READ_MINE", Map.of());
        return slip;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int generateBenefitPayments(String periodMonth, Long employeeId) {
        validatePeriodMonth(periodMonth);
        Long tenantId = currentTenantId();

        QueryWrapper<HrEmployeeBenefit> bwrap = new QueryWrapper<>();
        bwrap.eq("tenant_id", tenantId).eq("deleted", 0).eq("status", "ACTIVE");
        if (employeeId != null) {
            bwrap.eq("employee_id", employeeId);
        }
        List<HrEmployeeBenefit> enrollments = employeeBenefitMapper.selectList(bwrap);
        if (enrollments.isEmpty()) {
            return 0;
        }

        Map<Long, HrBenefitScheme> schemes = loadSchemes(tenantId);
        int created = 0;
        for (HrEmployeeBenefit enrollment : enrollments) {
            if (existsBenefit(tenantId, enrollment.getEmployeeId(), enrollment.getSchemeId(), periodMonth)) {
                continue;
            }
            HrBenefitScheme scheme = schemes.get(enrollment.getSchemeId());
            HrBenefitPayment payment = composeBenefitPayment(tenantId, enrollment, scheme, periodMonth);
            benefitPaymentMapper.insert(payment);
            created++;
        }
        log.info("月度福利明细生成完成，periodMonth: {}, tenant: {}, enrollments: {}, created: {}",
                periodMonth, tenantId, enrollments.size(), created);
        return created;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createBankCard(Map<String, Object> payload) {
        Long employeeId = extractLong(payload, "employeeId");
        essSupport.assertOwner(employeeId);
        boolean primary = Boolean.TRUE.equals(payload.get("isPrimary"));
        Long id = crudService.create(HrBankCard.class, payload);
        if (primary) {
            resetOtherPrimary(employeeId, id);
        }
        return id;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新银行卡", highRisk = true)
    public void updateBankCard(Long id, Map<String, Object> payload) {
        HrBankCard card = bankCardMapper.selectById(id);
        if (card == null) {
            throw new HrBusinessException("BANK_CARD_NOT_FOUND", "银行卡不存在：" + id);
        }
        essSupport.assertOwner(card.getEmployeeId());
        crudService.updateProperties(HrBankCard.class, id, payload);
        if (Boolean.TRUE.equals(payload.get("isPrimary"))) {
            resetOtherPrimary(card.getEmployeeId(), id);
        }
    }

    @Override
    public List<HrSalarySlip> listMySlips(int limit) {
        Long employeeId = essSupport.currentEmployeeId();
        QueryWrapper<HrSalarySlip> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", currentTenantId())
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
                .in("status", List.of("SUBMITTED", "PAID", "CONFIRMED"))
                .orderByDesc("period_month");
        List<HrSalarySlip> rows = salarySlipMapper
                .selectPage(new Page<>(1, Math.max(1, Math.min(limit, 36)), false), wrapper)
                .getRecords();
        rows.forEach(this::assertDigestValid);
        ruleSupport.audit("SALARY_SLIP", null, "EMPLOYEE_READ_LIST", Map.of("employeeId", employeeId, "count", rows.size()));
        return rows;
    }

    @Override
    public Map<String, Object> portalSummary() {
        Long employeeId = essSupport.currentEmployeeId();
        Long tenantId = currentTenantId();

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("employee", buildEmployeeBlock(employeeId));
        summary.put("leaveBalances", buildLeaveBalances(tenantId, employeeId));
        summary.put("latestSlip", buildLatestSlip(tenantId, employeeId));
        summary.put("pendingContracts", buildPendingContracts(tenantId, employeeId));
        summary.put("recentCertificates", buildRecentCertificates(tenantId, employeeId));
        Map<String, Object> messages = buildUnreadMessages(tenantId, employeeId);
        summary.put("unreadMessages", messages.get("items"));
        summary.put("unreadCount", messages.get("count"));
        return summary;
    }

    private Map<String, Object> buildEmployeeBlock(Long employeeId) {
        Map<String, Object> block = new LinkedHashMap<>();
        block.put("employeeId", employeeId);
        HrEmployee employee = employeeMapper.selectById(employeeId);
        if (employee != null) {
            block.put("employeeNo", employee.getEmployeeNo());
            block.put("name", employee.getName());
            block.put("employeeStatus", employee.getEmployeeStatus());
            block.put("hireDate", employee.getHireDate());
        }
        integrationQueryService.findEmployee(employeeId).ifPresent(vo -> {
            block.put("deptId", vo.getDeptId());
            block.put("deptName", vo.getDeptName());
            block.put("positionId", vo.getPositionId());
            block.put("positionName", vo.getPositionName());
        });
        return block;
    }

    private List<Map<String, Object>> buildLeaveBalances(Long tenantId, Long employeeId) {
        LocalDate today = LocalDate.now();
        List<HrLeavePeriod> periods = leavePeriodMapper.selectList(new QueryWrapper<HrLeavePeriod>()
                .eq("tenant_id", tenantId)
                .eq("deleted", 0)
                .eq("status", "OPEN")
                .le("start_date", today)
                .ge("end_date", today)
                .orderByDesc("default_flag"));
        if (periods.isEmpty()) {
            return List.of();
        }
        if (periods.size() != 1) throw new HrBusinessException("LEAVE_PERIOD_CONFLICT", "当前日期存在重叠的开放假期周期，请先核对周期配置");
        HrLeavePeriod period = periods.get(0);
        QueryWrapper<HrLeaveQuota> quotaWrapper = new QueryWrapper<>();
        quotaWrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("period_id", period.getPeriodId())
                .eq("deleted", 0);
        List<HrLeaveQuota> quotas = leaveQuotaMapper.selectList(quotaWrapper);
        if (quotas.isEmpty()) {
            return List.of();
        }
        QueryWrapper<HrLeaveType> typeWrapper = new QueryWrapper<>();
        typeWrapper.eq("tenant_id", tenantId);
        Map<Long, HrLeaveType> typeMap = new HashMap<>();
        for (HrLeaveType type : leaveTypeMapper.selectList(typeWrapper)) {
            typeMap.put(type.getId(), type);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (HrLeaveQuota quota : quotas) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("leaveTypeId", quota.getLeaveTypeId());
            row.put("periodId", quota.getPeriodId());
            HrLeaveType type = typeMap.get(quota.getLeaveTypeId());
            row.put("leaveCode", type == null ? null : type.getLeaveCode());
            row.put("leaveName", type == null ? null : type.getLeaveName());
            row.put("unit", type == null ? "DAY" : type.getUnit());
            row.put("totalQuota", quota.getTotalQuota());
            row.put("usedQuota", quota.getUsedQuota());
            row.put("frozenQuota", quota.getFrozenQuota());
            row.put("availableQuota", quota.getAvailableQuota());
            row.put("expiryDate", quota.getExpiryDate());
            result.add(row);
        }
        return result;
    }

    private HrSalarySlip buildLatestSlip(Long tenantId, Long employeeId) {
        QueryWrapper<HrSalarySlip> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
                .in("status", List.of("SUBMITTED", "PAID", "CONFIRMED"))
                .orderByDesc("period_month");
        List<HrSalarySlip> rows = salarySlipMapper.selectPage(new Page<>(1, 1, false), wrapper).getRecords();
        if (rows.isEmpty()) {
            return null;
        }
        HrSalarySlip slip = rows.get(0);
        assertDigestValid(slip);
        ruleSupport.audit("SALARY_SLIP", slip.getId(), "EMPLOYEE_READ_PORTAL", Map.of());
        return slip;
    }

    private List<Map<String, Object>> buildPendingContracts(Long tenantId, Long employeeId) {
        QueryWrapper<HrEmployeeContract> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
                .notIn("status", "EXPIRED", "TERMINATED")
                .ne("sign_status", "SIGNED")
                .orderByDesc("update_time");
        List<HrEmployeeContract> contracts = employeeContractMapper.selectList(wrapper);
        if (contracts.isEmpty()) {
            return List.of();
        }
        List<Long> contractIds = contracts.stream().map(HrEmployeeContract::getId).toList();
        QueryWrapper<HrContractSignature> sigWrapper = new QueryWrapper<>();
        sigWrapper.eq("tenant_id", tenantId)
                .in("contract_id", contractIds)
                .eq("deleted", 0)
                .orderByDesc("update_time");
        Map<Long, HrContractSignature> sigMap = new HashMap<>();
        for (HrContractSignature signature : contractSignatureMapper.selectList(sigWrapper)) {
            sigMap.putIfAbsent(signature.getContractId(), signature);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (HrEmployeeContract contract : contracts) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("contractId", contract.getId());
            row.put("contractNo", contract.getContractNo());
            row.put("contractType", contract.getContractType());
            row.put("startDate", contract.getStartDate());
            row.put("endDate", contract.getEndDate());
            row.put("signStatus", contract.getSignStatus());
            row.put("status", contract.getStatus());
            row.put("createTime", contract.getCreateTime());
            row.put("updateTime", contract.getUpdateTime());
            HrContractSignature signature = sigMap.get(contract.getId());
            if (signature != null) {
                row.put("signatureId", signature.getId());
                row.put("signMethod", signature.getSignMethod());
                row.put("signProcessInstanceId", signature.getProcessInstanceId());
                row.put("expireTime", signature.getExpireTime());
            }
            result.add(row);
        }
        return result;
    }

    private List<HrCertificateRequest> buildRecentCertificates(Long tenantId, Long employeeId) {
        QueryWrapper<HrCertificateRequest> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
                .orderByDesc("update_time");
        return certificateRequestMapper.selectPage(new Page<>(1, 5, false), wrapper).getRecords();
    }

    private Map<String, Object> buildUnreadMessages(Long tenantId, Long employeeId) {
        HrEmployee employee = employeeMapper.selectById(employeeId);
        if (employee == null || employee.getUserId() == null) {
            return Map.of("items", List.of(), "count", 0L);
        }
        QueryWrapper<HrMessageRecord> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("receiver_id", employee.getUserId())
                .eq("read_flag", 0)
                .eq("channel_type", "INTERNAL")
                .eq("send_status", "SUCCESS")
                .orderByDesc("create_time");
        List<HrMessageRecord> messages = messageRecordMapper.selectPage(new Page<>(1, 10, false), wrapper).getRecords();
        QueryWrapper<HrMessageRecord> countWrapper = new QueryWrapper<>();
        countWrapper.eq("tenant_id", tenantId)
                .eq("receiver_id", employee.getUserId())
                .eq("read_flag", 0)
                .eq("channel_type", "INTERNAL")
                .eq("send_status", "SUCCESS");
        long total = messageRecordMapper.selectCount(countWrapper);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", messages.stream().map(this::messageView).toList());
        result.put("count", total);
        return result;
    }

    private Map<String, Object> messageView(HrMessageRecord message) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("recordId", message.getRecordId());
        view.put("title", message.getTitle());
        view.put("content", message.getContent());
        view.put("messageCategory", message.getMessageCategory());
        view.put("bizType", message.getBizType());
        view.put("bizId", message.getBizId());
        view.put("linkUrl", message.getLinkUrl());
        view.put("readFlag", message.getReadFlag());
        view.put("createTime", message.getCreateTime());
        return view;
    }

    private boolean existsSlip(Long tenantId, Long employeeId, String periodMonth) {
        QueryWrapper<HrSalarySlip> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("period_month", periodMonth)
                .eq("deleted", 0);
        return salarySlipMapper.selectCount(wrapper) > 0;
    }

    private boolean existsBenefit(Long tenantId, Long employeeId, Long schemeId, String periodMonth) {
        QueryWrapper<HrBenefitPayment> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("scheme_id", schemeId)
                .eq("period_month", periodMonth)
                .eq("deleted", 0);
        return benefitPaymentMapper.selectCount(wrapper) > 0;
    }

    private HrSalarySlip composeSlip(Long tenantId, HrEmployeeComp comp, HrPayrollPeriod period) {
        String periodMonth = YearMonth.from(period.getEndDate()).toString();
        HrPayrollCalculationService.PayrollBase base = payrollCalculation.baseCompensation(comp, period);
        BigDecimal gross = base.gross();
        Map<String, BigDecimal> benefits = personalBenefits(tenantId, comp, period);
        BigDecimal personalBenefit = benefits.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal tax = BigDecimal.ZERO;
        BigDecimal deduction = personalBenefit.add(tax);
        BigDecimal net = gross.subtract(deduction).setScale(2, RoundingMode.HALF_UP);

        HrSalarySlip slip = new HrSalarySlip();
        slip.setTenantId(tenantId);
        slip.setEmployeeId(comp.getEmployeeId());
        slip.setPeriodMonth(periodMonth);
        slip.setGrossTotal(gross.setScale(2, RoundingMode.HALF_UP));
        slip.setDeductionTotal(deduction.setScale(2, RoundingMode.HALF_UP));
        slip.setNetTotal(net);
        slip.setTaxAmount(tax);
        slip.setBenefitAmount(personalBenefit.setScale(2, RoundingMode.HALF_UP));
        List<Map<String, Object>> components = buildSlipComponents(comp, comp.getTotalSalary(), tax, personalBenefit);
        components.add(base.snapshot());
        components.add(Map.of("name", "周期及入职分摊差额", "type", "EARNING", "amount", gross.subtract(comp.getTotalSalary()),
                "sourceType", "PAYROLL_PRORATION_ADJUSTMENT"));
        components.add(Map.of("name", "社保扣除月份快照", "type", "BENEFIT_SNAPSHOT", "amount", BigDecimal.ZERO, "months", benefits));
        slip.setComponents(components);
        slip.setPayDate(LocalDate.now());
        slip.setStatus("DRAFT");
        slip.setEmployeeConfirmed(false);
        slip.setDeleted(0);
        slip.setCreateBy(currentUserName());
        slip.setUpdateBy(currentUserName());
        return slip;
    }

    private void assertDigestValid(HrSalarySlip slip) {
        if (slip == null) {
            return;
        }
        String actual = computeDigest(slip);
        if (!StringUtils.hasText(slip.getDigestSha256())) {
            if (structuredTax(slip)) {
                if ("DRAFT".equals(slip.getStatus()) || "PENDING".equals(slip.getStatus())) return;
                throw new HrBusinessException("SLIP_DIGEST_MISSING", "已确定工资单缺少防篡改摘要");
            }
            UpdateWrapper<HrSalarySlip> wrapper = new UpdateWrapper<>();
            wrapper.eq("id", slip.getId())
                    .eq("tenant_id", slip.getTenantId())
                    .set("digest_sha256", actual)
                    .set("update_time", LocalDateTime.now());
            salarySlipMapper.update(null, wrapper);
            slip.setDigestSha256(actual);
            return;
        }
        if (!actual.equalsIgnoreCase(slip.getDigestSha256())) {
            throw new HrBusinessException("SLIP_TAMPERED", "工资条摘要校验失败，记录ID：" + slip.getId());
        }
    }

    private String computeDigest(HrSalarySlip slip) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("tenantId", slip.getTenantId());
            payload.put("employeeId", slip.getEmployeeId());
            payload.put("periodMonth", slip.getPeriodMonth());
            payload.put("grossTotal", slip.getGrossTotal());
            payload.put("deductionTotal", slip.getDeductionTotal());
            payload.put("netTotal", slip.getNetTotal());
            payload.put("taxAmount", slip.getTaxAmount());
            payload.put("benefitAmount", slip.getBenefitAmount());
            payload.put("components", com.cloudflow.hr.config.HrSalaryJsonTypeHandler.storageValue(slip.getComponents()));
            payload.put("payDate", slip.getPayDate());
            if (structuredTax(slip)) {
                payload.put("batchId", slip.getBatchId());
                payload.put("cumulativeTaxableIncome", slip.getCumulativeTaxableIncome());
                payload.put("cumulativeDeduction", slip.getCumulativeDeduction());
                payload.put("cumulativeTaxPayable", slip.getCumulativeTaxPayable());
                payload.put("cumulativeTaxPaid", slip.getCumulativeTaxPaid());
                payload.put("currentTax", slip.getCurrentTax());
            }
            Object canonical = structuredTax(slip) ? canonicalize(objectMapper.valueToTree(payload)) : payload;
            byte[] hash = digest.digest(objectMapper.writeValueAsString(canonical).getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte value : hash) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new HrBusinessException("SLIP_DIGEST_ERROR", "工资条摘要生成失败");
        }
    }

    private boolean structuredTax(HrSalarySlip slip) {
        return slip.getComponents() != null && slip.getComponents().stream().anyMatch(row -> "TAX_SNAPSHOT".equals(row.get("type")));
    }

    private Object canonicalize(JsonNode node) {
        if (node.isObject()) {
            Map<String, Object> values = new java.util.TreeMap<>();
            node.fields().forEachRemaining(entry -> values.put(entry.getKey(), canonicalize(entry.getValue())));
            return values;
        }
        if (node.isArray()) {
            List<Object> values = new ArrayList<>();
            node.forEach(value -> values.add(canonicalize(value)));
            return values;
        }
        if (node.isNumber()) return node.decimalValue().stripTrailingZeros().toPlainString();
        if (node.isNull()) return null;
        if (node.isBoolean()) return node.booleanValue();
        return node.textValue();
    }

    private Map<String, BigDecimal> personalBenefits(Long tenantId, HrEmployeeComp comp, HrPayrollPeriod period) {
        String timing = payrollCalculation.basis(comp).path("benefitTiming").asText("FIRST_PAYROLL");
        if (!List.of("FIRST_PAYROLL", "LAST_PAYROLL").contains(timing)) throw new HrBusinessException("PAYROLL_BASIS_INVALID", "社保扣除时点无效");
        QueryWrapper<HrBenefitPayment> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", comp.getEmployeeId())
                .between("period_month", YearMonth.from(period.getStartDate()).toString(), YearMonth.from(period.getEndDate()).toString())
                .eq("deleted", 0);
        List<HrBenefitPayment> payments = benefitPaymentMapper.selectList(wrapper);
        Map<String, BigDecimal> result = new LinkedHashMap<>();
        for (HrBenefitPayment payment : payments) {
            if ("LAST_PAYROLL".equals(timing) && YearMonth.parse(payment.getPeriodMonth()).atEndOfMonth().isAfter(period.getEndDate())) continue;
            result.merge(payment.getPeriodMonth(), HrRuleSupport.amount(payment.getPersonalAmount()), BigDecimal::add);
        }
        Map<String, BigDecimal> used = new HashMap<>();
        for (HrSalarySlip prior : payrollCalculation.employeeSlips(comp.getEmployeeId())) {
            if (!List.of("SUBMITTED", "PAID", "CONFIRMED").contains(String.valueOf(prior.getStatus()))) continue;
            Map<String, Object> snapshot = prior.getComponents() == null ? Map.of() : prior.getComponents().stream()
                    .filter(row -> "BENEFIT_SNAPSHOT".equals(row.get("type"))).findFirst().orElse(Map.of());
            if (snapshot.get("months") instanceof Map<?, ?> months) {
                months.forEach((month, value) -> used.merge(month.toString(), HrPayrollCalculationService.decimal(value), BigDecimal::add));
            } else used.merge(prior.getPeriodMonth(), HrRuleSupport.amount(prior.getBenefitAmount()), BigDecimal::add);
        }
        result.replaceAll((month, value) -> HrRuleSupport.amount(value.subtract(used.getOrDefault(month, BigDecimal.ZERO)).max(BigDecimal.ZERO)));
        return result;
    }

    private List<Map<String, Object>> buildSlipComponents(HrEmployeeComp comp,
                                                          BigDecimal gross,
                                                          BigDecimal tax,
                                                          BigDecimal personalBenefit) {
        Map<String, Object> componentValues = comp.getComponentValues();
        List<HrCompComponent> candidates = List.of();
        if (componentValues != null && !componentValues.isEmpty()) {
            List<Long> componentIds = HrPayrollComponentSnapshot.numericKeys(componentValues);
            candidates = compComponentMapper.selectList(new LambdaQueryWrapper<HrCompComponent>()
                    .eq(HrCompComponent::getTenantId, comp.getTenantId())
                    .and(selection -> {
                        selection.in(HrCompComponent::getComponentCode, componentValues.keySet());
                        if (!componentIds.isEmpty()) selection.or().in(HrCompComponent::getId, componentIds);
                    }));
        }
        List<Map<String, Object>> rows = HrPayrollComponentSnapshot.earnings(comp, gross, candidates);
        Map<String, Object> taxRow = new LinkedHashMap<>();
        taxRow.put("name", "个人所得税");
        taxRow.put("type", "DEDUCTION");
        taxRow.put("amount", tax);
        rows.add(taxRow);

        Map<String, Object> benefitRow = new LinkedHashMap<>();
        benefitRow.put("name", "社保公积金（个人）");
        benefitRow.put("type", "DEDUCTION");
        benefitRow.put("amount", personalBenefit);
        rows.add(benefitRow);
        return rows;
    }

    private Map<Long, HrBenefitScheme> loadSchemes(Long tenantId) {
        QueryWrapper<HrBenefitScheme> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId).eq("status", 1);
        Map<Long, HrBenefitScheme> result = new HashMap<>();
        for (HrBenefitScheme scheme : benefitSchemeMapper.selectList(wrapper)) {
            result.put(scheme.getId(), scheme);
        }
        return result;
    }

    private HrBenefitPayment composeBenefitPayment(Long tenantId,
                                                   HrEmployeeBenefit enrollment,
                                                   HrBenefitScheme scheme,
                                                   String periodMonth) {
        BigDecimal base = enrollment.getBaseAmount() == null ? BigDecimal.ZERO : enrollment.getBaseAmount();
        BigDecimal personalRate = resolveRate(scheme, "personalRate", DEFAULT_PERSONAL_RATE);
        BigDecimal companyRate = resolveRate(scheme, "companyRate", DEFAULT_COMPANY_RATE);
        BigDecimal personal = base.multiply(personalRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal company = base.multiply(companyRate).setScale(2, RoundingMode.HALF_UP);

        HrBenefitPayment payment = new HrBenefitPayment();
        payment.setTenantId(tenantId);
        payment.setEmployeeId(enrollment.getEmployeeId());
        payment.setSchemeId(enrollment.getSchemeId());
        payment.setPeriodMonth(periodMonth);
        payment.setBaseAmount(base.setScale(2, RoundingMode.HALF_UP));
        payment.setPersonalAmount(personal);
        payment.setCompanyAmount(company);
        payment.setItems(buildBenefitItems(scheme, base, personalRate, companyRate));
        payment.setStatus("CALCULATED");
        payment.setPayDate(LocalDate.now());
        payment.setDeleted(0);
        payment.setCreateBy(currentUserName());
        payment.setUpdateBy(currentUserName());
        return payment;
    }

    private List<Map<String, Object>> buildBenefitItems(HrBenefitScheme scheme,
                                                        BigDecimal base,
                                                        BigDecimal personalRate,
                                                        BigDecimal companyRate) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("schemeCode", scheme == null ? null : scheme.getSchemeCode());
        item.put("schemeName", scheme == null ? null : scheme.getSchemeName());
        item.put("base", base);
        item.put("personalRate", personalRate);
        item.put("companyRate", companyRate);
        rows.add(item);
        return rows;
    }

    private BigDecimal resolveRate(HrBenefitScheme scheme, String key, BigDecimal fallback) {
        if (scheme == null || scheme.getBenefitConfig() == null) {
            return fallback;
        }
        JsonNode node = scheme.getBenefitConfig().get(key);
        if (node == null || node.isNull() || !node.isValueNode()) {
            return fallback;
        }
        try {
            return new BigDecimal(node.asText());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private void resetOtherPrimary(Long employeeId, Long keepId) {
        UpdateWrapper<HrBankCard> wrapper = new UpdateWrapper<>();
        wrapper.eq("tenant_id", currentTenantId())
                .eq("employee_id", employeeId)
                .ne("id", keepId)
                .eq("deleted", 0)
                .set("is_primary", false)
                .set("update_time", LocalDateTime.now());
        bankCardMapper.update(null, wrapper);
    }

    private void validatePeriodMonth(String periodMonth) {
        if (!StringUtils.hasText(periodMonth) || !PERIOD_MONTH_PATTERN.matcher(periodMonth).matches()) {
            throw new HrBusinessException("INVALID_PARAMETER",
                    "periodMonth 必须为 YYYY-MM 格式，当前值：" + periodMonth);
        }
    }

    private Long extractLong(Map<String, Object> payload, String key) {
        Object value = payload == null ? null : payload.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Number num) {
            return num.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Long currentTenantId() {
        Long tenantId = com.cloudflow.common.tenant.TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? 100000L : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}

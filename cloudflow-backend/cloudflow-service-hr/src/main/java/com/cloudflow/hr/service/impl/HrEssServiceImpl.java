package com.cloudflow.hr.service.impl;

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
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrLeaveQuota;
import com.cloudflow.hr.domain.entity.HrLeaveType;
import com.cloudflow.hr.domain.entity.HrSalarySlip;
import com.cloudflow.hr.domain.entity.HrSelfServiceMessage;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrBankCardMapper;
import com.cloudflow.hr.mapper.HrBenefitPaymentMapper;
import com.cloudflow.hr.mapper.HrBenefitSchemeMapper;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.mapper.HrContractSignatureMapper;
import com.cloudflow.hr.mapper.HrEmployeeBenefitMapper;
import com.cloudflow.hr.mapper.HrEmployeeCompMapper;
import com.cloudflow.hr.mapper.HrEmployeeContractMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.mapper.HrLeaveQuotaMapper;
import com.cloudflow.hr.mapper.HrLeaveTypeMapper;
import com.cloudflow.hr.mapper.HrSalarySlipMapper;
import com.cloudflow.hr.mapper.HrSelfServiceMessageMapper;
import com.cloudflow.hr.service.IHrEssService;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrIntegrationQueryService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
    private static final BigDecimal DEFAULT_TAX_RATE = new BigDecimal("0.10");
    private static final Pattern PERIOD_MONTH_PATTERN = Pattern.compile("^\\d{4}-(0[1-9]|1[0-2])$");

    private final HrEssSupport essSupport;
    private final HrTypedCrudService crudService;
    private final IHrIntegrationQueryService integrationQueryService;
    private final HrSalarySlipMapper salarySlipMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrEmployeeCompMapper employeeCompMapper;
    private final HrEmployeeBenefitMapper employeeBenefitMapper;
    private final HrBenefitSchemeMapper benefitSchemeMapper;
    private final HrBenefitPaymentMapper benefitPaymentMapper;
    private final HrBankCardMapper bankCardMapper;
    private final HrLeaveQuotaMapper leaveQuotaMapper;
    private final HrLeaveTypeMapper leaveTypeMapper;
    private final HrEmployeeContractMapper employeeContractMapper;
    private final HrContractSignatureMapper contractSignatureMapper;
    private final HrCertificateRequestMapper certificateRequestMapper;
    private final HrSelfServiceMessageMapper selfServiceMessageMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int generateSalarySlips(String periodMonth, Long employeeId) {
        validatePeriodMonth(periodMonth);
        Long tenantId = currentTenantId();

        QueryWrapper<HrEmployeeComp> compWrapper = new QueryWrapper<>();
        compWrapper.eq("tenant_id", tenantId).eq("deleted", 0).eq("status", "ACTIVE");
        if (employeeId != null) {
            compWrapper.eq("employee_id", employeeId);
        }
        List<HrEmployeeComp> comps = employeeCompMapper.selectList(compWrapper);
        if (comps.isEmpty()) {
            return 0;
        }

        int created = 0;
        for (HrEmployeeComp comp : comps) {
            if (existsSlip(tenantId, comp.getEmployeeId(), periodMonth)) {
                continue;
            }
            HrSalarySlip slip = composeSlip(tenantId, comp, periodMonth);
            salarySlipMapper.insert(slip);
            created++;
        }
        log.info("月度工资条生成完成，periodMonth: {}, tenant: {}, employees: {}, created: {}",
                periodMonth, tenantId, comps.size(), created);
        return created;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void confirmSalarySlip(Long slipId) {
        if (slipId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "工资条 ID 不能为空");
        }
        HrSalarySlip slip = salarySlipMapper.selectById(slipId);
        if (slip == null) {
            throw new HrBusinessException("SLIP_NOT_FOUND", "工资条不存在：" + slipId);
        }
        essSupport.assertOwner(slip.getEmployeeId());
        UpdateWrapper<HrSalarySlip> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", slipId)
                .eq("tenant_id", currentTenantId())
                .set("employee_confirmed", true)
                .set("confirmed_time", LocalDateTime.now())
                .set("update_time", LocalDateTime.now());
        salarySlipMapper.update(null, wrapper);
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
                .orderByDesc("period_month")
                .last("LIMIT " + Math.max(1, Math.min(limit, 36)));
        return salarySlipMapper.selectList(wrapper);
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
        int year = LocalDate.now().getYear();
        QueryWrapper<HrLeaveQuota> quotaWrapper = new QueryWrapper<>();
        quotaWrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("year", year)
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
                .orderByDesc("period_month")
                .last("LIMIT 1");
        List<HrSalarySlip> rows = salarySlipMapper.selectList(wrapper);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private List<Map<String, Object>> buildPendingContracts(Long tenantId, Long employeeId) {
        QueryWrapper<HrEmployeeContract> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("deleted", 0)
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
                .orderByDesc("update_time")
                .last("LIMIT 5");
        return certificateRequestMapper.selectList(wrapper);
    }

    private Map<String, Object> buildUnreadMessages(Long tenantId, Long employeeId) {
        QueryWrapper<HrSelfServiceMessage> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("read_flag", false)
                .orderByDesc("create_time")
                .last("LIMIT 10");
        List<HrSelfServiceMessage> messages = selfServiceMessageMapper.selectList(wrapper);
        QueryWrapper<HrSelfServiceMessage> countWrapper = new QueryWrapper<>();
        countWrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("read_flag", false);
        long total = selfServiceMessageMapper.selectCount(countWrapper);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", messages);
        result.put("count", total);
        return result;
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

    private HrSalarySlip composeSlip(Long tenantId, HrEmployeeComp comp, String periodMonth) {
        BigDecimal gross = comp.getTotalSalary() == null ? BigDecimal.ZERO : comp.getTotalSalary();
        BigDecimal personalBenefit = sumPersonalBenefit(tenantId, comp.getEmployeeId(), periodMonth);
        BigDecimal taxBase = gross.subtract(personalBenefit).max(BigDecimal.ZERO);
        BigDecimal tax = taxBase.multiply(DEFAULT_TAX_RATE).setScale(2, RoundingMode.HALF_UP);
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
        slip.setComponents(buildSlipComponents(comp, gross, tax, personalBenefit));
        slip.setPayDate(LocalDate.now());
        slip.setStatus("DRAFT");
        slip.setEmployeeConfirmed(false);
        slip.setDeleted(0);
        slip.setCreateBy(currentUserName());
        slip.setUpdateBy(currentUserName());
        return slip;
    }

    private BigDecimal sumPersonalBenefit(Long tenantId, Long employeeId, String periodMonth) {
        QueryWrapper<HrBenefitPayment> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", tenantId)
                .eq("employee_id", employeeId)
                .eq("period_month", periodMonth)
                .eq("deleted", 0);
        List<HrBenefitPayment> payments = benefitPaymentMapper.selectList(wrapper);
        return payments.stream()
                .map(HrBenefitPayment::getPersonalAmount)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private List<Map<String, Object>> buildSlipComponents(HrEmployeeComp comp,
                                                          BigDecimal gross,
                                                          BigDecimal tax,
                                                          BigDecimal personalBenefit) {
        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, Object> componentValues = comp.getComponentValues();
        if (componentValues != null) {
            for (Map.Entry<String, Object> entry : componentValues.entrySet()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", entry.getKey());
                row.put("type", "EARNING");
                row.put("amount", entry.getValue());
                rows.add(row);
            }
        } else {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", "基本工资");
            row.put("type", "EARNING");
            row.put("amount", gross);
            rows.add(row);
        }
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

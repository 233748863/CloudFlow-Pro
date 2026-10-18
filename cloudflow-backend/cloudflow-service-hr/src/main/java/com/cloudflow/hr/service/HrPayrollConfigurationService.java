package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.hr.domain.dto.HrTaxDeductionPayload;
import com.cloudflow.hr.domain.dto.HrTaxProfilePayload;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrPayrollConfigurationService {
    private final HrTypedCrudService crudService;
    private final HrRuleSupport support;
    private final HrPayrollPeriodMapper periodMapper;
    private final HrPayrollBatchMapper batchMapper;
    private final HrTaxSlabMapper slabMapper;
    private final HrTaxSlabDetailMapper detailMapper;
    private final HrTaxProfileMapper profileMapper;
    private final HrTaxDeductionMapper deductionMapper;
    private final HrSalarySlipMapper slipMapper;
    private final HrRuleProofService proofService;
    private final HrCompStructureMapper structureMapper;
    private final com.cloudflow.hr.mapper.HrHMapper hMapper;

    public List<Map<String, Object>> list(String resource, Map<String, Object> query) {
        Class<?> type = switch (resource) {
            case "periods" -> HrPayrollPeriod.class;
            case "tax-slabs" -> HrTaxSlab.class;
            case "tax-slab-details" -> HrTaxSlabDetail.class;
            case "structures" -> HrCompStructure.class;
            default -> throw new HrBusinessException("INVALID_RESOURCE", "薪资配置类别无效");
        };
        List<Map<String, Object>> rows = crudService.list(type, query);
        support.audit("PAYROLL_CONFIG", null, "READ", Map.of("resource", resource));
        return rows;
    }

    public HrPayrollPeriod period(Long id) {
        HrPayrollPeriod period = id == null ? null : periodMapper.selectById(id);
        if (period == null || flag(period.getDeleted()) || !Objects.equals(period.getTenantId(), tenantId())) throw new HrBusinessException("PERIOD_NOT_FOUND", "薪资周期不存在");
        return period;
    }

    public void assertOpen(HrPayrollPeriod period) {
        if ("CLOSED".equals(period.getStatus())) throw new HrBusinessException("PAYROLL_PERIOD_CLOSED", "薪资周期已关闭");
    }

    public void saveBasis(Long id, com.cloudflow.hr.domain.dto.HrPayrollBasisRequest request) {
        if (request == null || !List.of("MONTHLY", "PER_PERIOD").contains(String.valueOf(request.getSalaryBasis()))
                || !List.of("WORKDAYS", "CALENDAR_DAYS").contains(String.valueOf(request.getProrationBasis()))
                || !List.of("FIRST_PAYROLL", "LAST_PAYROLL").contains(String.valueOf(request.getBenefitTiming()))) {
            throw new HrBusinessException("PAYROLL_BASIS_INVALID", "请明确工资金额口径、入职及周期分摊方式、社保扣除时点");
        }
        support.locked("payroll-structure:" + id, () -> {
            HrCompStructure structure = structureMapper.selectById(id);
            if (structure == null || !Objects.equals(structure.getTenantId(), tenantId())) throw new HrBusinessException("STRUCTURE_NOT_FOUND", "薪资结构不存在");
            com.fasterxml.jackson.databind.node.ObjectNode config = structure.getComponentConfig() != null && structure.getComponentConfig().isObject()
                    ? ((com.fasterxml.jackson.databind.node.ObjectNode) structure.getComponentConfig()).deepCopy()
                    : com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
            config.putObject("payrollBasis").put("salaryBasis", request.getSalaryBasis())
                    .put("prorationBasis", request.getProrationBasis()).put("benefitTiming", request.getBenefitTiming());
            crudService.updateProperties(HrCompStructure.class, id, Map.of("componentConfig", config));
            support.audit("PAYROLL_STRUCTURE", id, "CONFIGURE_BASIS", request);
            return null;
        });
    }

    public Long savePeriod(Long id, HrPayrollPeriod payload) {
        if (payload == null || !StringUtils.hasText(payload.getPeriodName()) || payload.getStartDate() == null || payload.getEndDate() == null
                || payload.getEndDate().isBefore(payload.getStartDate()) || payload.getFrequency() == null
                || !List.of("MONTHLY", "SEMI_MONTHLY", "WEEKLY").contains(payload.getFrequency())) {
            throw new HrBusinessException("INVALID_PAYROLL_PERIOD", "薪资周期名称、日期范围及发薪频率无效");
        }
        return support.locked("payroll-period-config", () -> id == null ? savePeriodLocked(null, payload)
                : support.locked("payroll-period:" + id, () -> savePeriodLocked(id, payload)));
    }

    private Long savePeriodLocked(Long id, HrPayrollPeriod payload) {
            if (id != null) {
                HrPayrollPeriod current = period(id);
                assertOpen(current);
                if (batchMapper.selectCount(new LambdaQueryWrapper<HrPayrollBatch>().eq(HrPayrollBatch::getTenantId, tenantId())
                        .eq(HrPayrollBatch::getPayrollPeriodId, id).ne(HrPayrollBatch::getStatus, "CANCELLED").eq(HrPayrollBatch::getDeleted, 0)) > 0) {
                    throw new HrBusinessException("PAYROLL_PERIOD_IN_USE", "周期已有薪资批次，不可修改");
                }
                for (HrSalarySlip slip : slipMapper.selectList(new LambdaQueryWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenantId())
                        .eq(HrSalarySlip::getDeleted, 0).isNull(HrSalarySlip::getBatchId).ne(HrSalarySlip::getStatus, "CANCELLED")
                        .between(HrSalarySlip::getPeriodMonth, java.time.YearMonth.from(current.getStartDate()).toString(), java.time.YearMonth.from(current.getEndDate()).toString()))) {
                    if (overlaps(slip, current)) throw new HrBusinessException("PAYROLL_PERIOD_IN_USE", "周期已有独立工资单或补正工资单，不可修改");
                }
            }
            if (periodMapper.selectCount(new LambdaQueryWrapper<HrPayrollPeriod>().eq(HrPayrollPeriod::getTenantId, tenantId())
                    .eq(HrPayrollPeriod::getDeleted, 0).ne(id != null, HrPayrollPeriod::getPeriodId, id)
                    .le(HrPayrollPeriod::getStartDate, payload.getEndDate()).ge(HrPayrollPeriod::getEndDate, payload.getStartDate())) > 0) {
                throw new HrBusinessException("PAYROLL_PERIOD_OVERLAP", "薪资周期日期不可重叠");
            }
            Map<String, Object> fields = support.configurationPayload(payload, "periodId");
            fields.put("status", "OPEN");
            if (id == null) return crudService.create(HrPayrollPeriod.class, fields);
            crudService.update(HrPayrollPeriod.class, id, fields);
            return id;
    }

    private boolean overlaps(HrSalarySlip slip, HrPayrollPeriod period) {
        java.time.LocalDate from = java.time.YearMonth.parse(slip.getPeriodMonth()).atDay(1);
        java.time.LocalDate to = java.time.YearMonth.parse(slip.getPeriodMonth()).atEndOfMonth();
        Map<String, Object> snapshot = slip.getComponents() == null ? Map.of() : slip.getComponents().stream()
                .filter(row -> "TAX_SNAPSHOT".equals(row.get("type"))).findFirst().orElse(Map.of());
        if (snapshot.get("periodStart") != null && snapshot.get("periodEnd") != null) {
            from = java.time.LocalDate.parse(snapshot.get("periodStart").toString());
            to = java.time.LocalDate.parse(snapshot.get("periodEnd").toString());
        }
        return !to.isBefore(period.getStartDate()) && !from.isAfter(period.getEndDate());
    }

    public void closePeriod(Long id) {
        support.locked("payroll-period:" + id, () -> {
            HrPayrollPeriod period = period(id);
            if ("CLOSED".equals(period.getStatus())) return null;
            if (hMapper.pendingPayroll(tenantId(), id, null) > 0) throw new HrBusinessException("OVERTIME_SETTLEMENT_PENDING", "工资周期存在未结清加班费，不能关闭");
            for (HrSalarySlip slip : slipMapper.selectList(new LambdaQueryWrapper<HrSalarySlip>().eq(HrSalarySlip::getTenantId, tenantId())
                    .eq(HrSalarySlip::getDeleted, 0).isNull(HrSalarySlip::getBatchId).notIn(HrSalarySlip::getStatus, List.of("PAID", "CANCELLED"))
                    .between(HrSalarySlip::getPeriodMonth, java.time.YearMonth.from(period.getStartDate()).toString(), java.time.YearMonth.from(period.getEndDate()).toString()))) {
                if (overlaps(slip, period)) {
                    throw new HrBusinessException("PAYROLL_SLIP_PENDING", "周期仍有未发放的独立工资单或补正工资单");
                }
            }
            if (batchMapper.selectCount(new LambdaQueryWrapper<HrPayrollBatch>().eq(HrPayrollBatch::getTenantId, tenantId())
                    .eq(HrPayrollBatch::getPayrollPeriodId, id).eq(HrPayrollBatch::getDeleted, 0)
                    .notIn(HrPayrollBatch::getStatus, List.of("PAID", "CANCELLED"))) > 0) throw new HrBusinessException("PAYROLL_BATCH_PENDING", "周期仍有未发放或未取消的批次");
            crudService.updateProperties(HrPayrollPeriod.class, id, Map.of("status", "CLOSED"));
            support.audit("PAYROLL_PERIOD", id, "CLOSE", Map.of());
            return null;
        });
    }

    public HrTaxSlab slab(Long id) {
        HrTaxSlab slab = id == null ? null : slabMapper.selectById(id);
        if (slab == null || flag(slab.getDeleted()) || !Objects.equals(slab.getTenantId(), tenantId())) throw new HrBusinessException("TAX_TABLE_PENDING", HrPayrollTaxCalculator.PENDING_RATE_MESSAGE);
        return slab;
    }

    public List<HrTaxSlabDetail> details(Long slabId) {
        slab(slabId);
        return detailMapper.selectList(new LambdaQueryWrapper<HrTaxSlabDetail>().eq(HrTaxSlabDetail::getTenantId, tenantId())
                .eq(HrTaxSlabDetail::getSlabId, slabId).eq(HrTaxSlabDetail::getDeleted, 0).orderByAsc(HrTaxSlabDetail::getLevelNo));
    }

    public Long saveSlab(Long id, HrTaxSlab payload) {
        if (payload == null || !StringUtils.hasText(payload.getSlabName()) || !StringUtils.hasText(payload.getRegion())
                || payload.getEffectiveFrom() == null || payload.getEffectiveTo() != null && payload.getEffectiveTo().isBefore(payload.getEffectiveFrom())
                || payload.getThresholdAmount() == null || payload.getThresholdAmount().signum() < 0
                || payload.getStatus() == null || !List.of("DRAFT", "ACTIVE", "INACTIVE").contains(payload.getStatus())) {
            throw new HrBusinessException("INVALID_TAX_TABLE", "税率表名称、地区、生效日期、起征点及状态无效");
        }
        return support.locked("tax-config", () -> {
            if (id != null) slab(id);
            if ("ACTIVE".equals(payload.getStatus())) {
                Set<String> roles = UserContext.getRoles();
                if (roles == null || !roles.contains("admin") && !roles.contains("finance")) {
                    throw new HrBusinessException("FORBIDDEN", "仅管理员或财务可启用税率表");
                }
                validateDetails(id == null ? List.of() : details(id), true);
            }
            Map<String, Object> fields = support.configurationPayload(payload, "slabId");
            Long savedId = id;
            if (id == null) savedId = crudService.create(HrTaxSlab.class, fields);
            else crudService.update(HrTaxSlab.class, id, fields);
            support.audit("TAX_SLAB", savedId, "CONFIGURE", fields);
            return savedId;
        });
    }

    public void saveDetails(Long id, List<HrTaxSlabDetail> payload) {
        support.locked("tax-config", () -> {
            HrTaxSlab slab = slab(id);
            if ("ACTIVE".equals(slab.getStatus())) throw new HrBusinessException("TAX_TABLE_ACTIVE", "请先停用税率表再修改档位，历史工资单快照保留");
            validateDetails(payload, false);
            // Logical deletion retains the unique (tenant, slab, level) key and
            // prevents saving a replacement. The existing lock and transaction
            // cover physical replacement; salary slips own historical snapshots.
            detailMapper.deleteForReplacement(tenantId(), id);
            for (HrTaxSlabDetail detail : payload) {
                Map<String, Object> fields = support.configurationPayload(detail, "slabDetailId");
                fields.put("slabId", id);
                crudService.create(HrTaxSlabDetail.class, fields);
            }
            support.audit("TAX_SLAB", id, "CONFIGURE_DETAILS", payload);
            return null;
        });
    }

    private void validateDetails(List<HrTaxSlabDetail> details, boolean activating) {
        if (details == null || details.isEmpty() || activating && details.size() != 7) throw new HrBusinessException("INVALID_TAX_TABLE", "启用中国税率表前须核定完整7档税率");
        if (details.stream().anyMatch(detail -> detail == null || detail.getLevelNo() == null || detail.getLevelNo() < 1)
                || details.stream().map(HrTaxSlabDetail::getLevelNo).distinct().count() != details.size()) throw new HrBusinessException("INVALID_TAX_TABLE", "税率档次须为不同的正整数");
        HrPayrollTaxCalculator.validate(details.stream().map(detail -> new HrPayrollTaxCalculator.Bracket(
                detail.getFromAmount(), detail.getToAmount(), detail.getTaxRate(), detail.getQuickDeduction())).toList());
    }

    public Long saveProfile(Long id, HrTaxProfilePayload payload) {
        if (payload == null) throw new HrBusinessException("INVALID_TAX_PROFILE", "税档不能为空");
        support.assertEmployeeScope(payload.getEmployeeId());
        HrTaxSlab selectedSlab = slab(payload.getTaxSlabId());
        return support.locked("tax-profile:" + payload.getEmployeeId(), () -> {
            if (id != null) {
                HrTaxProfile old = profileMapper.selectById(id);
                if (old == null || !Objects.equals(old.getTenantId(), tenantId()) || !Objects.equals(old.getEmployeeId(), payload.getEmployeeId())) throw new HrBusinessException("INVALID_TAX_PROFILE", "税档不属于该员工");
            }
            if (profileMapper.selectCount(new LambdaQueryWrapper<HrTaxProfile>().eq(HrTaxProfile::getTenantId, tenantId())
                    .eq(HrTaxProfile::getEmployeeId, payload.getEmployeeId()).ne(id != null, HrTaxProfile::getId, id)) > 0) throw new HrBusinessException("TAX_PROFILE_EXISTS", "该员工已有税档，请修改现有税档");
            Map<String, Object> fields = support.configurationPayload(payload, "id");
            // Unsubmitted legacy fields must survive a tax-table change. New
            // profiles initialize the required encrypted allowance explicitly.
            if (payload.getThreshold() == null) {
                if (id == null) fields.put("threshold", selectedSlab.getThresholdAmount());
                else fields.remove("threshold");
            }
            if (payload.getTaxConfig() == null) fields.remove("taxConfig");
            if (id == null) return crudService.create(HrTaxProfile.class, fields);
            crudService.update(HrTaxProfile.class, id, fields);
            return id;
        });
    }

    public Long saveDeduction(Long id, HrTaxDeductionPayload payload) {
        return saveDeduction(id, payload, false);
    }

    public Long saveMyDeduction(Long id, HrTaxDeductionPayload payload) {
        return saveDeduction(id, payload, true);
    }

    private Long saveDeduction(Long id, HrTaxDeductionPayload payload, boolean ownDeclaration) {
        if (payload == null || payload.getAmount() == null || payload.getAmount().signum() < 0 || !StringUtils.hasText(payload.getDeductionType())
                || payload.getStartDate() == null || payload.getEndDate() != null && payload.getEndDate().isBefore(payload.getStartDate())) throw new HrBusinessException("INVALID_TAX_DEDUCTION", "专项扣除类别、金额及有效期无效");
        support.assertEmployeeScope(payload.getEmployeeId());
        return support.locked("tax-deduction:" + payload.getEmployeeId(), () -> {
            if (ownDeclaration && (UserContext.getUserId() == null
                    || !Objects.equals(support.employee(payload.getEmployeeId()).getUserId(), UserContext.getUserId()))) {
                throw new HrBusinessException("FORBIDDEN_CROSS_EMPLOYEE", "员工自助仅可申报本人的专项扣除");
            }
            if (id != null && !Objects.equals(deduction(id).getEmployeeId(), payload.getEmployeeId())) throw new HrBusinessException("INVALID_TAX_DEDUCTION", "不可变更申报员工");
            if (StringUtils.hasText(payload.getProofFileUrl()) && (id == null || !Objects.equals(deduction(id).getProofFileUrl(), payload.getProofFileUrl()))) {
                proofService.requireOwned(payload.getProofFileUrl(), "HR_TAX_PROOF");
            }
            Map<String, Object> fields = support.configurationPayload(payload, "id");
            fields.put("status", "ACTIVE");
            fields.put("declareStatus", StringUtils.hasText(payload.getProofFileUrl()) ? "PROOF_SUBMITTED" : "DECLARED");
            fields.put("verifyBy", null); fields.put("verifyTime", null); fields.put("rejectReason", null);
            Long savedId = id;
            if (ownDeclaration) savedId = saveOwnedDeclaration(id, payload);
            else if (id == null) savedId = crudService.create(HrTaxDeduction.class, fields);
            else crudService.update(HrTaxDeduction.class, id, fields);
            support.audit("TAX_DEDUCTION", savedId, "DECLARE", Map.of("employeeId", payload.getEmployeeId()));
            return savedId;
        });
    }

    /** The ESS path writes only declaration fields after resolving the account owner under the employee lock. */
    private Long saveOwnedDeclaration(Long id, HrTaxDeductionPayload payload) {
        HrTaxDeduction row = id == null ? new HrTaxDeduction() : deduction(id);
        LocalDateTime now = LocalDateTime.now();
        if (id == null) {
            row.setTenantId(tenantId());
            row.setEmployeeId(payload.getEmployeeId());
            row.setDeleted(0);
            row.setVersion(0);
            row.setCreateBy(userName());
            row.setCreateTime(now);
        }
        row.setDeductionType(payload.getDeductionType());
        row.setAmount(payload.getAmount());
        row.setStartDate(payload.getStartDate());
        row.setEndDate(payload.getEndDate());
        row.setProofFileUrl(payload.getProofFileUrl());
        row.setRemark(payload.getRemark());
        row.setStatus("ACTIVE");
        row.setDeclareStatus(StringUtils.hasText(payload.getProofFileUrl()) ? "PROOF_SUBMITTED" : "DECLARED");
        row.setVerifyBy(null);
        row.setVerifyTime(null);
        row.setRejectReason(null);
        row.setUpdateBy(userName());
        row.setUpdateTime(now);
        if (id == null) {
            deductionMapper.insert(row);
        } else {
            UpdateWrapper<HrTaxDeduction> update = new UpdateWrapper<>();
            update.eq("id", id).eq("tenant_id", tenantId()).eq("employee_id", payload.getEmployeeId()).eq("deleted", 0)
                    .set("verify_by", null).set("verify_time", null).set("reject_reason", null)
                    .set(row.getEndDate() == null, "end_date", null)
                    .set(row.getProofFileUrl() == null, "proof_file_url", null)
                    .set(row.getRemark() == null, "remark", null);
            if (deductionMapper.update(row, update) != 1) {
                throw new HrBusinessException("DEDUCTION_UPDATE_CONFLICT", "专项扣除已变更，请刷新后重试");
            }
        }
        return row.getId();
    }

    public void verifyDeduction(Long id, boolean approved, String reason) {
        HrTaxDeduction initial = deduction(id);
        support.locked("tax-deduction:" + initial.getEmployeeId(), () -> {
            HrTaxDeduction row = deduction(id);
            if (!"PROOF_SUBMITTED".equals(row.getDeclareStatus()) || !StringUtils.hasText(row.getProofFileUrl())) throw new HrBusinessException("DEDUCTION_PROOF_REQUIRED", "仅已举证的申报可审核");
            if (Objects.equals(support.employee(row.getEmployeeId()).getUserId(), UserContext.getUserId())) throw new HrBusinessException("DEDUCTION_SELF_REVIEW", "不可审核本人的专项扣除证明");
            if (!approved && !StringUtils.hasText(reason)) throw new HrBusinessException("REASON_REQUIRED", "驳回须填写原因");
            row.setDeclareStatus(approved ? "VERIFIED" : "REJECTED");
            row.setVerifyBy(UserContext.getUserId()); row.setVerifyTime(LocalDateTime.now());
            row.setRejectReason(approved ? "" : reason);
            deductionMapper.updateById(row);
            support.audit("TAX_DEDUCTION", id, "VERIFY", Map.of("approved", approved));
            return null;
        });
    }

    public HrTaxDeduction deduction(Long id) {
        HrTaxDeduction row = id == null ? null : deductionMapper.selectById(id);
        if (row == null || flag(row.getDeleted()) || !Objects.equals(row.getTenantId(), tenantId())) throw new HrBusinessException("DEDUCTION_NOT_FOUND", "专项扣除申报不存在");
        support.assertEmployeeScope(row.getEmployeeId());
        return row;
    }

    public List<HrTaxDeduction> employeeDeductions(Long employeeId) {
        support.assertEmployeeScope(employeeId);
        List<HrTaxDeduction> rows = deductionMapper.selectList(new LambdaQueryWrapper<HrTaxDeduction>()
                .eq(HrTaxDeduction::getTenantId, tenantId()).eq(HrTaxDeduction::getEmployeeId, employeeId)
                .eq(HrTaxDeduction::getDeleted, 0).orderByDesc(HrTaxDeduction::getCreateTime));
        support.audit("TAX_DEDUCTION", null, "READ_MINE", Map.of("employeeId", employeeId));
        return rows;
    }

    @Audit(name = "删除个税扣除申报", spel = "#id", highRisk = true)
    public void deleteDeduction(Long id) {
        HrTaxDeduction row = deduction(id);
        support.locked("tax-deduction:" + row.getEmployeeId(), () -> {
            crudService.delete(HrTaxDeduction.class, id);
            support.audit("TAX_DEDUCTION", id, "DELETE", Map.of());
            return null;
        });
    }
}

package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrBenefitSchemePayload;
import com.cloudflow.hr.domain.dto.HrCompChangePayload;
import com.cloudflow.hr.domain.dto.HrCompComponentPayload;
import com.cloudflow.hr.domain.dto.HrCompGradePayload;
import com.cloudflow.hr.domain.dto.HrCompStructurePayload;
import com.cloudflow.hr.domain.dto.HrEmployeeBenefitPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeCompPayload;
import com.cloudflow.hr.domain.dto.HrTaxDeductionPayload;
import com.cloudflow.hr.domain.dto.HrTaxProfilePayload;
import com.cloudflow.hr.domain.dto.compensation.HrCompCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrBenefitScheme;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrCompGrade;
import com.cloudflow.hr.domain.entity.HrCompStructure;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeBenefit;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrTaxDeduction;
import com.cloudflow.hr.domain.entity.HrTaxProfile;
import com.cloudflow.hr.domain.vo.compensation.HrBenefitSchemeVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompChangeVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompComponentVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompGradeVO;
import com.cloudflow.hr.domain.vo.compensation.HrCompStructureVO;
import com.cloudflow.hr.domain.vo.compensation.HrEmployeeBenefitVO;
import com.cloudflow.hr.domain.vo.compensation.HrEmployeeCompVO;
import com.cloudflow.hr.domain.vo.compensation.HrTaxDeductionVO;
import com.cloudflow.hr.domain.vo.compensation.HrTaxProfileVO;
import com.cloudflow.hr.mapper.HrCompStructureMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompComponentController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;
    private final com.cloudflow.hr.service.HrRuleSupport support;

    @GetMapping("/components")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrCompComponentVO>> listComponents(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrCompComponent.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrCompComponentVO.class, objectMapper));
    }

    @SysLog("新增HR薪酬项")
    @RepeatSubmit
    @PostMapping("/components")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createComponent(@RequestBody HrCompComponentPayload payload) {
        return R.ok(crudService.create(HrCompComponent.class, support.configurationPayload(payload, "id")));
    }

    @SysLog("修改HR薪酬项")
    @PutMapping("/components/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateComponent(@PathVariable Long id, @RequestBody HrCompComponentPayload payload) {
        crudService.update(HrCompComponent.class, id, support.configurationPayload(payload, "id"));
        return R.ok();
    }

    @SysLog("删除HR薪酬项")
    @DeleteMapping("/components/{id}")
    @SaCheckPermission("hr:compensation:remove")
    public R<Void> deleteComponent(@PathVariable Long id) {
        crudService.delete(HrCompComponent.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompStructureController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/structures")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrCompStructureVO>> listStructures(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrCompStructure.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrCompStructureVO.class, objectMapper));
    }

    @SysLog("新增HR薪酬结构")
    @RepeatSubmit
    @PostMapping("/structures")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createStructure(@RequestBody HrCompStructurePayload payload) {
        return R.ok(crudService.create(HrCompStructure.class, payload));
    }

    @SysLog("修改HR薪酬结构")
    @PutMapping("/structures/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateStructure(@PathVariable Long id, @RequestBody HrCompStructurePayload payload) {
        crudService.update(HrCompStructure.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR薪酬结构")
    @DeleteMapping("/structures/{id}")
    @SaCheckPermission("hr:compensation:remove")
    public R<Void> deleteStructure(@PathVariable Long id) {
        crudService.delete(HrCompStructure.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompGradeController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/grades")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrCompGradeVO>> listGrades(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrCompGrade.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrCompGradeVO.class, objectMapper));
    }

    @SysLog("新增HR薪级")
    @RepeatSubmit
    @PostMapping("/grades")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createGrade(@RequestBody HrCompGradePayload payload) {
        return R.ok(crudService.create(HrCompGrade.class, payload));
    }

    @SysLog("删除HR薪级")
    @DeleteMapping("/grades/{id}")
    @SaCheckPermission("hr:compensation:remove")
    public R<Void> deleteGrade(@PathVariable Long id) {
        crudService.delete(HrCompGrade.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrEmployeeCompController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;
    private final HrEmployeeMapper employeeMapper;
    private final HrCompStructureMapper structureMapper;

    @GetMapping("/employee-compensations")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrEmployeeCompVO>> listEmployeeComps(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        List<Map<String, Object>> rows = crudService.list(HrEmployeeComp.class,
                MapConverters.toServiceQuery(query, objectMapper));
        enrichEmployeeFields(rows);
        enrichStructureFields(rows);
        return R.ok(MapConverters.toVOList(
                rows, HrEmployeeCompVO.class, objectMapper));
    }

    @SysLog("新增HR员工薪酬")
    @RepeatSubmit
    @PostMapping("/employee-compensations")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createEmployeeComp(@RequestBody HrEmployeeCompPayload payload) {
        return R.ok(crudService.create(HrEmployeeComp.class, payload));
    }

    @SysLog("修改HR员工薪酬")
    @PutMapping("/employee-compensations/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateEmployeeComp(@PathVariable Long id, @RequestBody HrEmployeeCompPayload payload) {
        crudService.update(HrEmployeeComp.class, id, payload);
        return R.ok();
    }

    private void enrichEmployeeFields(List<Map<String, Object>> rows) {
        Set<Long> employeeIds = rows.stream()
                .map(row -> toLong(row.get("employeeId")))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (employeeIds.isEmpty()) {
            return;
        }
        Map<Long, HrEmployee> employees = employeeMapper.selectBatchIds(employeeIds).stream()
                .collect(Collectors.toMap(HrEmployee::getId, Function.identity(), (left, right) -> left));
        for (Map<String, Object> row : rows) {
            HrEmployee employee = employees.get(toLong(row.get("employeeId")));
            if (employee != null) {
                row.put("employeeNo", employee.getEmployeeNo());
                row.put("employeeName", employee.getName());
                row.put("deptId", employee.getDeptId());
                row.put("userId", employee.getUserId());
            }
        }
    }

    private void enrichStructureFields(List<Map<String, Object>> rows) {
        Set<Long> structureIds = rows.stream()
                .map(row -> toLong(row.get("structureId")))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (structureIds.isEmpty()) {
            return;
        }
        Map<Long, HrCompStructure> structures = structureMapper.selectBatchIds(structureIds).stream()
                .collect(Collectors.toMap(HrCompStructure::getId, Function.identity(), (left, right) -> left));
        for (Map<String, Object> row : rows) {
            HrCompStructure structure = structures.get(toLong(row.get("structureId")));
            if (structure != null) {
                row.put("structureName", structure.getStructureName());
            }
        }
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompChangeController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;
    private final HrEmployeeMapper employeeMapper;

    @GetMapping("/changes")
    @SaCheckPermission("hr:compensation:list")
    public R<PageResult<HrCompChangeVO>> listCompChanges(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrCompChange.class,
                MapConverters.toServiceQuery(query, objectMapper));
        List<Map<String, Object>> rows = mapRows(raw.get("rows"));
        enrichEmployeeFields(rows);
        List<Map<String, Object>> visibleRows = filterRowsByDataScope(rows);
        raw.put("rows", visibleRows);
        raw.put("records", visibleRows);
        raw.put("total", visibleRows.size());
        return R.ok(MapConverters.toPageResult(
                raw, HrCompChangeVO.class, objectMapper));
    }

    @SysLog("新增HR调薪变更")
    @RepeatSubmit
    @PostMapping("/changes")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createCompChange(@RequestBody HrCompChangePayload payload) {
        return R.ok(crudService.create(HrCompChange.class, payload));
    }

    @SysLog("变更HR调薪状态")
    @PostMapping("/changes/{id}/{action}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> changeCompChangeStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrCompChange.class, id, action);
        return R.ok();
    }

    private void enrichEmployeeFields(List<Map<String, Object>> rows) {
        Set<Long> employeeIds = rows.stream()
                .map(row -> toLong(row.get("employeeId")))
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (employeeIds.isEmpty()) {
            return;
        }
        Map<Long, HrEmployee> employees = employeeMapper.selectBatchIds(employeeIds).stream()
                .collect(Collectors.toMap(HrEmployee::getId, Function.identity(), (left, right) -> left));
        for (Map<String, Object> row : rows) {
            HrEmployee employee = employees.get(toLong(row.get("employeeId")));
            if (employee != null) {
                row.put("employeeNo", employee.getEmployeeNo());
                row.put("employeeName", employee.getName());
                row.put("deptId", employee.getDeptId());
                row.put("userId", employee.getUserId());
            }
        }
    }

    private List<Map<String, Object>> filterRowsByDataScope(List<Map<String, Object>> rows) {
        Integer dsType = UserContext.getDsType();
        if (dsType == null || dsType == 0 || isAdmin()) {
            return rows;
        }
        if (dsType == 4) {
            Long userId = UserContext.getUserId();
            return rows.stream()
                    .filter(row -> Objects.equals(toLong(row.get("userId")), userId))
                    .toList();
        }
        Set<Long> deptIds = UserContext.getDsDeptIds().stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (deptIds.isEmpty()) {
            return List.of();
        }
        return rows.stream()
                .filter(row -> deptIds.contains(toLong(row.get("deptId"))))
                .toList();
    }

    private boolean isAdmin() {
        return UserContext.getRoles() != null
                && UserContext.getRoles().stream().anyMatch(role -> "admin".equalsIgnoreCase(role));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> mapRows(Object rowsObj) {
        if (!(rowsObj instanceof List<?> rows)) {
            return List.of();
        }
        return rows.stream()
                .filter(Map.class::isInstance)
                .map(row -> (Map<String, Object>) row)
                .toList();
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrBenefitSchemeController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/benefits")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrBenefitSchemeVO>> listBenefits(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrBenefitScheme.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrBenefitSchemeVO.class, objectMapper));
    }

    @SysLog("新增HR福利方案")
    @RepeatSubmit
    @PostMapping("/benefits")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createBenefit(@RequestBody HrBenefitSchemePayload payload) {
        return R.ok(crudService.create(HrBenefitScheme.class, payload));
    }

    @SysLog("修改HR福利方案")
    @PutMapping("/benefits/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateBenefit(@PathVariable Long id, @RequestBody HrBenefitSchemePayload payload) {
        crudService.update(HrBenefitScheme.class, id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrEmployeeBenefitController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/employee-benefits")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrEmployeeBenefitVO>> listEmployeeBenefits(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeBenefit.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrEmployeeBenefitVO.class, objectMapper));
    }

    @SysLog("新增HR员工福利")
    @RepeatSubmit
    @PostMapping("/employee-benefits")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createEmployeeBenefit(@RequestBody HrEmployeeBenefitPayload payload) {
        return R.ok(crudService.create(HrEmployeeBenefit.class, payload));
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrTaxProfileController {

    private final HrTypedCrudService crudService;
    private final com.cloudflow.hr.service.HrPayrollConfigurationService configuration;
    private final ObjectMapper objectMapper;

    @GetMapping("/tax-profiles")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrTaxProfileVO>> listTaxProfiles(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTaxProfile.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTaxProfileVO.class, objectMapper));
    }

    @SysLog("新增HR个税档案")
    @RepeatSubmit
    @PostMapping("/tax-profiles")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createTaxProfile(@RequestBody HrTaxProfilePayload payload) {
        return R.ok(configuration.saveProfile(null, payload));
    }

    @SysLog("修改HR个税档案")
    @RepeatSubmit
    @PutMapping("/tax-profiles/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateTaxProfile(@PathVariable Long id, @RequestBody HrTaxProfilePayload payload) {
        configuration.saveProfile(id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrTaxDeductionController {

    private final HrTypedCrudService crudService;
    private final com.cloudflow.hr.service.HrPayrollConfigurationService configuration;
    private final ObjectMapper objectMapper;

    @GetMapping("/tax-deductions")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrTaxDeductionVO>> listTaxDeductions(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTaxDeduction.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTaxDeductionVO.class, objectMapper));
    }

    @SysLog("新增HR个税扣除")
    @RepeatSubmit
    @PostMapping("/tax-deductions")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createTaxDeduction(@RequestBody HrTaxDeductionPayload payload) {
        return R.ok(configuration.saveDeduction(null, payload));
    }

    @SysLog("修改HR个税扣除")
    @RepeatSubmit
    @PutMapping("/tax-deductions/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateTaxDeduction(@PathVariable Long id, @RequestBody HrTaxDeductionPayload payload) {
        configuration.saveDeduction(id, payload);
        return R.ok();
    }

    @SysLog("删除HR个税扣除")
    @RepeatSubmit
    @DeleteMapping("/tax-deductions/{id}")
    @SaCheckPermission("hr:compensation:remove")
    public R<Void> deleteTaxDeduction(@PathVariable Long id) {
        configuration.deleteDeduction(id);
        return R.ok();
    }

    @SysLog("审核专项扣除证明")
    @RepeatSubmit
    @PostMapping("/tax-deductions/{id}/verify")
    @SaCheckPermission("hr:payroll:verify")
    public R<Void> verify(@PathVariable Long id, @RequestParam boolean approved, @RequestParam(required = false) String reason) {
        configuration.verifyDeduction(id, approved, reason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation/payroll")
@RequiredArgsConstructor
class HrPayrollController {
    private final com.cloudflow.hr.service.HrPayrollBatchService batches;
    private final com.cloudflow.hr.service.HrPayrollConfigurationService configuration;
    private final com.cloudflow.hr.service.HrPayrollCorrectionService corrections;
    private final com.cloudflow.hr.service.HrRuleAsyncExecutor executor;
    private final com.cloudflow.hr.service.HrSalarySlipPrintService printService;
    private final com.cloudflow.hr.service.HrRuleProofService proofService;

    @GetMapping("/deductions/{id}/proof")
    @SaCheckPermission("hr:payroll:verify")
    public org.springframework.http.ResponseEntity<byte[]> proof(@PathVariable Long id) {
        return proofService.download(configuration.deduction(id).getProofFileUrl(), "HR_TAX_PROOF");
    }

    @GetMapping("/config/{resource:periods|tax-slabs|tax-slab-details|structures}")
    @SaCheckPermission("hr:payroll:list")
    public R<List<Map<String, Object>>> configurations(@PathVariable String resource, @RequestParam Map<String, Object> query) {
        return R.ok(configuration.list(resource, query));
    }

    @SysLog("核定薪资结构计薪口径")
    @RepeatSubmit
    @PutMapping("/structures/{id}")
    @SaCheckPermission("hr:payroll:configure")
    public R<Void> saveBasis(@PathVariable Long id, @RequestBody com.cloudflow.hr.domain.dto.HrPayrollBasisRequest payload) {
        configuration.saveBasis(id, payload);
        return R.ok();
    }

    @SysLog("创建薪资周期")
    @RepeatSubmit
    @PostMapping("/periods")
    @SaCheckPermission("hr:payroll:configure")
    public R<Long> createPeriod(@RequestBody com.cloudflow.hr.domain.entity.HrPayrollPeriod payload) {
        return R.ok(configuration.savePeriod(null, payload));
    }

    @SysLog("修改薪资周期")
    @RepeatSubmit
    @PutMapping("/periods/{id}")
    @SaCheckPermission("hr:payroll:configure")
    public R<Long> updatePeriod(@PathVariable Long id, @RequestBody com.cloudflow.hr.domain.entity.HrPayrollPeriod payload) {
        return R.ok(configuration.savePeriod(id, payload));
    }

    @SysLog("关闭薪资周期")
    @RepeatSubmit
    @PostMapping("/periods/{id}/close")
    @SaCheckPermission("hr:payroll:configure")
    public R<Void> closePeriod(@PathVariable Long id) { configuration.closePeriod(id); return R.ok(); }

    @SysLog("创建个税税率表")
    @RepeatSubmit
    @PostMapping("/tax-slabs")
    @SaCheckPermission("hr:payroll:configure")
    public R<Long> createSlab(@RequestBody com.cloudflow.hr.domain.entity.HrTaxSlab payload) { return R.ok(configuration.saveSlab(null, payload)); }

    @SysLog("修改个税税率表")
    @RepeatSubmit
    @PutMapping("/tax-slabs/{id}")
    @SaCheckPermission("hr:payroll:configure")
    public R<Long> updateSlab(@PathVariable Long id, @RequestBody com.cloudflow.hr.domain.entity.HrTaxSlab payload) { return R.ok(configuration.saveSlab(id, payload)); }

    @SysLog("配置个税档位")
    @RepeatSubmit
    @PutMapping("/tax-slabs/{id}/details")
    @SaCheckPermission("hr:payroll:configure")
    public R<Void> saveDetails(@PathVariable Long id, @RequestBody List<com.cloudflow.hr.domain.entity.HrTaxSlabDetail> payload) { configuration.saveDetails(id, payload); return R.ok(); }

    @GetMapping("/batches")
    @SaCheckPermission("hr:payroll:list")
    public R<List<com.cloudflow.hr.domain.entity.HrPayrollBatch>> list() { return R.ok(batches.list()); }

    @GetMapping("/batches/{id}")
    @SaCheckPermission("hr:payroll:list")
    public R<Map<String, Object>> detail(@PathVariable Long id) { return R.ok(batches.detail(id)); }

    @SysLog("预览算薪员工与前置校验")
    @RepeatSubmit
    @PostMapping("/batches/preview")
    @SaCheckPermission("hr:payroll:create")
    public R<List<com.cloudflow.hr.domain.entity.HrPayrollBatchEmployee>> preview(@RequestBody com.cloudflow.hr.domain.dto.HrPayrollBatchCreateRequest payload) { return R.ok(batches.preview(payload)); }

    @SysLog("创建薪资批次")
    @RepeatSubmit
    @PostMapping("/batches")
    @SaCheckPermission("hr:payroll:create")
    public R<Long> create(@RequestBody com.cloudflow.hr.domain.dto.HrPayrollBatchCreateRequest payload) { return R.ok(batches.create(payload)); }

    @SysLog("调整批次员工清单")
    @RepeatSubmit
    @PutMapping("/batches/{id}/employees")
    @SaCheckPermission("hr:payroll:create")
    public R<Void> employees(@PathVariable Long id, @RequestBody com.cloudflow.hr.domain.dto.HrPayrollBatchCreateRequest payload) { batches.replaceEmployees(id, payload); return R.ok(); }

    @SysLog("计算薪资批次")
    @RepeatSubmit
    @PostMapping("/batches/{id}/calculate")
    @SaCheckPermission("hr:payroll:calculate")
    public R<String> calculate(@PathVariable Long id) { return R.ok(batches.start(id, false)); }

    @SysLog("重跑算薪失败员工")
    @RepeatSubmit
    @PostMapping("/batches/{id}/retry")
    @SaCheckPermission("hr:payroll:calculate")
    public R<String> retry(@PathVariable Long id) { return R.ok(batches.start(id, true)); }

    @SysLog("提交薪资批次")
    @RepeatSubmit
    @PostMapping("/batches/{id}/submit")
    @SaCheckPermission("hr:payroll:submit")
    public R<Void> submit(@PathVariable Long id) { batches.submit(id); return R.ok(); }

    @SysLog("登记批次工资发放")
    @RepeatSubmit
    @PostMapping("/batches/{id}/pay")
    @SaCheckPermission("hr:payroll:pay")
    public R<Void> pay(@PathVariable Long id) { batches.pay(id); return R.ok(); }

    @SysLog("取消薪资批次")
    @RepeatSubmit
    @PostMapping("/batches/{id}/cancel")
    @SaCheckPermission("hr:payroll:cancel")
    public R<Void> cancel(@PathVariable Long id) { batches.cancel(id); return R.ok(); }

    @GetMapping("/tasks/{executeNo}")
    @SaCheckPermission("hr:payroll:calculate")
    public R<com.cloudflow.common.job.model.JobResult> task(@PathVariable String executeNo) { return R.ok(executor.status(executeNo)); }

    @GetMapping("/slips/preview")
    @SaCheckPermission("hr:payroll:list")
    public R<com.cloudflow.hr.domain.entity.HrSalarySlip> previewSalary(@RequestParam Long employeeId, @RequestParam Long periodId, @RequestParam(defaultValue = "false") boolean deductUnverified) {
        return R.ok(batches.previewSalary(employeeId, periodId, deductUnverified));
    }

    @GetMapping("/slips/paid-options")
    @SaCheckPermission("hr:payroll:list")
    public R<List<Map<String, String>>> paidSalaryOptions(@RequestParam Long employeeId, @RequestParam Long periodId) {
        return R.ok(batches.paidSalaryOptions(employeeId, periodId));
    }

    @GetMapping("/slips/{id}")
    @SaCheckPermission("hr:payroll:list")
    public R<com.cloudflow.hr.domain.entity.HrSalarySlip> slip(@PathVariable Long id) { return R.ok(batches.salarySlip(id)); }

    @GetMapping("/slips/{id}/pdf")
    @SaCheckPermission("hr:payroll:list")
    public org.springframework.http.ResponseEntity<byte[]> print(@PathVariable Long id) { return printService.response(batches.salarySlip(id)); }

    @GetMapping("/corrections")
    @SaCheckPermission("hr:payroll:list")
    public R<List<com.cloudflow.hr.domain.entity.HrPayrollCorrection>> corrections() { return R.ok(corrections.list()); }

    @SysLog(value = "发起工资补正审批", logParams = false)
    @RepeatSubmit
    @PostMapping("/corrections")
    @SaCheckPermission("hr:payroll:correct")
    public R<Long> correct(@RequestBody com.cloudflow.hr.domain.dto.HrPayrollCorrectionRequest payload) { return R.ok(corrections.create(payload)); }

    @SysLog("登记补正工资发放")
    @RepeatSubmit
    @PostMapping("/corrections/{id}/pay")
    @SaCheckPermission("hr:payroll:pay")
    public R<Void> payCorrection(@PathVariable Long id) { corrections.pay(id); return R.ok(); }
}

@RestController
@RequestMapping("/ess/tax-deductions")
@RequiredArgsConstructor
class HrEssTaxDeductionController {
    private final com.cloudflow.hr.service.HrEssSupport essSupport;
    private final com.cloudflow.hr.service.HrRuleProofService proofService;

    @SysLog(value = "上传本人专项扣除证明", logParams = false)
    @RepeatSubmit
    @PostMapping("/proof")
    @SaCheckPermission("hr:payroll:mine")
    public R<Map<String, Object>> uploadProof(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        essSupport.currentEmployeeId();
        return R.ok(proofService.upload(file, "HR_TAX_PROOF"));
    }

    @GetMapping("/{id}/proof")
    @SaCheckPermission("hr:payroll:mine")
    public org.springframework.http.ResponseEntity<byte[]> proof(@PathVariable Long id) {
        HrTaxDeduction deduction = configuration.deduction(id);
        essSupport.assertOwner(deduction.getEmployeeId());
        return proofService.download(deduction.getProofFileUrl(), "HR_TAX_PROOF");
    }
    private final com.cloudflow.hr.service.HrPayrollConfigurationService configuration;

    @GetMapping
    @SaCheckPermission("hr:payroll:mine")
    public R<List<HrTaxDeduction>> list() { return R.ok(configuration.employeeDeductions(essSupport.currentEmployeeId())); }

    @SysLog("员工申报专项扣除")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:payroll:mine")
    public R<Long> declare(@RequestBody HrTaxDeductionPayload payload) {
        payload.setEmployeeId(essSupport.currentEmployeeId());
        return R.ok(configuration.saveMyDeduction(null, payload));
    }

    @SysLog("员工补充专项扣除证明")
    @RepeatSubmit
    @PutMapping("/{id}")
    @SaCheckPermission("hr:payroll:mine")
    public R<Long> update(@PathVariable Long id, @RequestBody HrTaxDeductionPayload payload) {
        essSupport.assertOwner(configuration.deduction(id).getEmployeeId());
        payload.setEmployeeId(essSupport.currentEmployeeId());
        return R.ok(configuration.saveMyDeduction(id, payload));
    }
}

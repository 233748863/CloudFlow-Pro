package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrBenefitSchemePayload;
import com.cloudflow.hr.domain.dto.HrCompChangePayload;
import com.cloudflow.hr.domain.dto.HrCompComponentPayload;
import com.cloudflow.hr.domain.dto.HrCompGradePayload;
import com.cloudflow.hr.domain.dto.HrCompStructurePayload;
import com.cloudflow.hr.domain.dto.HrEmployeeBenefitPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeCompPayload;
import com.cloudflow.hr.domain.dto.HrTaxDeductionPayload;
import com.cloudflow.hr.domain.dto.HrTaxProfilePayload;
import com.cloudflow.hr.domain.entity.HrBenefitScheme;
import com.cloudflow.hr.domain.entity.HrCompChange;
import com.cloudflow.hr.domain.entity.HrCompComponent;
import com.cloudflow.hr.domain.entity.HrCompGrade;
import com.cloudflow.hr.domain.entity.HrCompStructure;
import com.cloudflow.hr.domain.entity.HrEmployeeBenefit;
import com.cloudflow.hr.domain.entity.HrEmployeeComp;
import com.cloudflow.hr.domain.entity.HrTaxDeduction;
import com.cloudflow.hr.domain.entity.HrTaxProfile;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrCompComponentController {

    private final HrTypedCrudService crudService;

    @GetMapping("/components")
    public R<?> listComponents(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrCompComponent.class, query));
    }

    @SysLog("新增HR薪酬项")
    @PostMapping("/components")
    public R<Long> createComponent(@RequestBody HrCompComponentPayload payload) {
        return R.ok(crudService.create(HrCompComponent.class, payload));
    }

    @SysLog("修改HR薪酬项")
    @PutMapping("/components/{id}")
    public R<Void> updateComponent(@PathVariable Long id, @RequestBody HrCompComponentPayload payload) {
        crudService.update(HrCompComponent.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR薪酬项")
    @DeleteMapping("/components/{id}")
    public R<Void> deleteComponent(@PathVariable Long id) {
        crudService.delete(HrCompComponent.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrCompStructureController {

    private final HrTypedCrudService crudService;

    @GetMapping("/structures")
    public R<?> listStructures(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrCompStructure.class, query));
    }

    @SysLog("新增HR薪酬结构")
    @PostMapping("/structures")
    public R<Long> createStructure(@RequestBody HrCompStructurePayload payload) {
        return R.ok(crudService.create(HrCompStructure.class, payload));
    }

    @SysLog("修改HR薪酬结构")
    @PutMapping("/structures/{id}")
    public R<Void> updateStructure(@PathVariable Long id, @RequestBody HrCompStructurePayload payload) {
        crudService.update(HrCompStructure.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR薪酬结构")
    @DeleteMapping("/structures/{id}")
    public R<Void> deleteStructure(@PathVariable Long id) {
        crudService.delete(HrCompStructure.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrCompGradeController {

    private final HrTypedCrudService crudService;

    @GetMapping("/grades")
    public R<?> listGrades(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrCompGrade.class, query));
    }

    @SysLog("新增HR薪级")
    @PostMapping("/grades")
    public R<Long> createGrade(@RequestBody HrCompGradePayload payload) {
        return R.ok(crudService.create(HrCompGrade.class, payload));
    }

    @SysLog("删除HR薪级")
    @DeleteMapping("/grades/{id}")
    public R<Void> deleteGrade(@PathVariable Long id) {
        crudService.delete(HrCompGrade.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrEmployeeCompController {

    private final HrTypedCrudService crudService;

    @GetMapping("/employee-compensations")
    public R<?> listEmployeeComps(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrEmployeeComp.class, query));
    }

    @SysLog("新增HR员工薪酬")
    @PostMapping("/employee-compensations")
    public R<Long> createEmployeeComp(@RequestBody HrEmployeeCompPayload payload) {
        return R.ok(crudService.create(HrEmployeeComp.class, payload));
    }

    @SysLog("修改HR员工薪酬")
    @PutMapping("/employee-compensations/{id}")
    public R<Void> updateEmployeeComp(@PathVariable Long id, @RequestBody HrEmployeeCompPayload payload) {
        crudService.update(HrEmployeeComp.class, id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrCompChangeController {

    private final HrTypedCrudService crudService;

    @GetMapping("/changes")
    public R<?> listCompChanges(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrCompChange.class, query));
    }

    @SysLog("新增HR调薪变更")
    @PostMapping("/changes")
    public R<Long> createCompChange(@RequestBody HrCompChangePayload payload) {
        return R.ok(crudService.create(HrCompChange.class, payload));
    }

    @SysLog("变更HR调薪状态")
    @PostMapping("/changes/{id}/{action}")
    public R<Void> changeCompChangeStatus(@PathVariable Long id, @PathVariable String action) {
        crudService.changeStatus(HrCompChange.class, id, action);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrBenefitSchemeController {

    private final HrTypedCrudService crudService;

    @GetMapping("/benefits")
    public R<?> listBenefits(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrBenefitScheme.class, query));
    }

    @SysLog("新增HR福利方案")
    @PostMapping("/benefits")
    public R<Long> createBenefit(@RequestBody HrBenefitSchemePayload payload) {
        return R.ok(crudService.create(HrBenefitScheme.class, payload));
    }

    @SysLog("修改HR福利方案")
    @PutMapping("/benefits/{id}")
    public R<Void> updateBenefit(@PathVariable Long id, @RequestBody HrBenefitSchemePayload payload) {
        crudService.update(HrBenefitScheme.class, id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrEmployeeBenefitController {

    private final HrTypedCrudService crudService;

    @GetMapping("/employee-benefits")
    public R<?> listEmployeeBenefits(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrEmployeeBenefit.class, query));
    }

    @SysLog("新增HR员工福利")
    @PostMapping("/employee-benefits")
    public R<Long> createEmployeeBenefit(@RequestBody HrEmployeeBenefitPayload payload) {
        return R.ok(crudService.create(HrEmployeeBenefit.class, payload));
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrTaxProfileController {

    private final HrTypedCrudService crudService;

    @GetMapping("/tax-profiles")
    public R<?> listTaxProfiles(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrTaxProfile.class, query));
    }

    @SysLog("新增HR个税档案")
    @PostMapping("/tax-profiles")
    public R<Long> createTaxProfile(@RequestBody HrTaxProfilePayload payload) {
        return R.ok(crudService.create(HrTaxProfile.class, payload));
    }

    @SysLog("修改HR个税档案")
    @PutMapping("/tax-profiles/{id}")
    public R<Void> updateTaxProfile(@PathVariable Long id, @RequestBody HrTaxProfilePayload payload) {
        crudService.update(HrTaxProfile.class, id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
@SaCheckLogin
class HrTaxDeductionController {

    private final HrTypedCrudService crudService;

    @GetMapping("/tax-deductions")
    public R<?> listTaxDeductions(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.list(HrTaxDeduction.class, query));
    }

    @SysLog("新增HR个税扣除")
    @PostMapping("/tax-deductions")
    public R<Long> createTaxDeduction(@RequestBody HrTaxDeductionPayload payload) {
        return R.ok(crudService.create(HrTaxDeduction.class, payload));
    }

    @SysLog("修改HR个税扣除")
    @PutMapping("/tax-deductions/{id}")
    public R<Void> updateTaxDeduction(@PathVariable Long id, @RequestBody HrTaxDeductionPayload payload) {
        crudService.update(HrTaxDeduction.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR个税扣除")
    @DeleteMapping("/tax-deductions/{id}")
    public R<Void> deleteTaxDeduction(@PathVariable Long id) {
        crudService.delete(HrTaxDeduction.class, id);
        return R.ok();
    }
}

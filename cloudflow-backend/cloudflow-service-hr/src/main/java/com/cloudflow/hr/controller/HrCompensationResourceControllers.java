package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompComponentController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/components")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrCompComponentVO>> listComponents(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrCompComponent.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrCompComponentVO.class, objectMapper));
    }

    @SysLog("新增HR薪酬项")
    @PostMapping("/components")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createComponent(@RequestBody HrCompComponentPayload payload) {
        return R.ok(crudService.create(HrCompComponent.class, payload));
    }

    @SysLog("修改HR薪酬项")
    @PutMapping("/components/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateComponent(@PathVariable Long id, @RequestBody HrCompComponentPayload payload) {
        crudService.update(HrCompComponent.class, id, payload);
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

    @GetMapping("/employee-compensations")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrEmployeeCompVO>> listEmployeeComps(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeComp.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrEmployeeCompVO.class, objectMapper));
    }

    @SysLog("新增HR员工薪酬")
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
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrCompChangeController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/changes")
    @SaCheckPermission("hr:compensation:list")
    public R<PageResult<HrCompChangeVO>> listCompChanges(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrCompChange.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrCompChangeVO.class, objectMapper));
    }

    @SysLog("新增HR调薪变更")
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
    private final ObjectMapper objectMapper;

    @GetMapping("/tax-profiles")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrTaxProfileVO>> listTaxProfiles(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTaxProfile.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTaxProfileVO.class, objectMapper));
    }

    @SysLog("新增HR个税档案")
    @PostMapping("/tax-profiles")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createTaxProfile(@RequestBody HrTaxProfilePayload payload) {
        return R.ok(crudService.create(HrTaxProfile.class, payload));
    }

    @SysLog("修改HR个税档案")
    @PutMapping("/tax-profiles/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateTaxProfile(@PathVariable Long id, @RequestBody HrTaxProfilePayload payload) {
        crudService.update(HrTaxProfile.class, id, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/compensation")
@RequiredArgsConstructor
class HrTaxDeductionController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/tax-deductions")
    @SaCheckPermission("hr:compensation:list")
    public R<List<HrTaxDeductionVO>> listTaxDeductions(@Validated @ModelAttribute HrCompCommonQueryDTO query) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrTaxDeduction.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTaxDeductionVO.class, objectMapper));
    }

    @SysLog("新增HR个税扣除")
    @PostMapping("/tax-deductions")
    @SaCheckPermission("hr:compensation:add")
    public R<Long> createTaxDeduction(@RequestBody HrTaxDeductionPayload payload) {
        return R.ok(crudService.create(HrTaxDeduction.class, payload));
    }

    @SysLog("修改HR个税扣除")
    @PutMapping("/tax-deductions/{id}")
    @SaCheckPermission("hr:compensation:edit")
    public R<Void> updateTaxDeduction(@PathVariable Long id, @RequestBody HrTaxDeductionPayload payload) {
        crudService.update(HrTaxDeduction.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR个税扣除")
    @DeleteMapping("/tax-deductions/{id}")
    @SaCheckPermission("hr:compensation:remove")
    public R<Void> deleteTaxDeduction(@PathVariable Long id) {
        crudService.delete(HrTaxDeduction.class, id);
        return R.ok();
    }
}

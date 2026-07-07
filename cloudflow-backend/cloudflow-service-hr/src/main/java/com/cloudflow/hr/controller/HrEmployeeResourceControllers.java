package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.HrEmergencyContactPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeContractPayload;
import com.cloudflow.hr.domain.dto.HrEmployeeDocumentPayload;
import com.cloudflow.hr.domain.dto.HrEmployeePayload;
import com.cloudflow.hr.domain.dto.employee.HrEmployeeCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrEmergencyContact;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeContract;
import com.cloudflow.hr.domain.entity.HrEmployeeDocument;
import com.cloudflow.hr.domain.vo.employee.HrEmergencyContactVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeContractVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeDocumentVO;
import com.cloudflow.hr.domain.vo.employee.HrEmployeeVO;
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
import java.util.Map;

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/current")
    @SaCheckPermission("hr:employees:view")
    public R<HrEmployeeVO> currentEmployee() {
        Long userId = UserContext.getUserId();
        Map<String, Object> query = userId == null ? Map.of() : Map.of("userId", userId);
        Map<String, Object> row = crudService.list(HrEmployee.class, query).stream().findFirst().orElse(null);
        return R.ok(row == null ? null : MapConverters.toVO(row, HrEmployeeVO.class, objectMapper));
    }

    @GetMapping
    @SaCheckPermission("hr:employees:list")
    public R<PageResult<HrEmployeeVO>> listEmployees(@Validated @ModelAttribute HrEmployeeCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrEmployee.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrEmployeeVO.class, objectMapper));
    }

    @SysLog("新增HR员工")
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("hr:employees:add")
    public R<Long> createEmployee(@RequestBody HrEmployeePayload payload) {
        return R.ok(crudService.create(HrEmployee.class, payload));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:employees:view")
    public R<HrEmployeeVO> getEmployee(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrEmployee.class, id), HrEmployeeVO.class, objectMapper));
    }

    @SysLog("修改HR员工")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateEmployee(@PathVariable Long id, @RequestBody HrEmployeePayload payload) {
        crudService.update(HrEmployee.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:employees:remove")
    public R<Void> deleteEmployee(@PathVariable Long id) {
        crudService.delete(HrEmployee.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeContractController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{employeeId}/contracts")
    @SaCheckPermission("hr:employees:view")
    public R<List<HrEmployeeContractVO>> listContracts(@PathVariable Long employeeId) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeContract.class, Map.of("employeeId", employeeId)),
                HrEmployeeContractVO.class, objectMapper));
    }

    @SysLog("新增HR员工合同")
    @RepeatSubmit
    @PostMapping("/contracts")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createContract(@RequestBody HrEmployeeContractPayload payload) {
        return R.ok(crudService.create(HrEmployeeContract.class, payload));
    }

    @SysLog("修改HR员工合同")
    @PutMapping("/contracts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateContract(@PathVariable Long id, @RequestBody HrEmployeeContractPayload payload) {
        crudService.update(HrEmployeeContract.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工合同")
    @DeleteMapping("/contracts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteContract(@PathVariable Long id) {
        crudService.delete(HrEmployeeContract.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmployeeDocumentController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{employeeId}/documents")
    @SaCheckPermission("hr:employees:view")
    public R<List<HrEmployeeDocumentVO>> listDocuments(@PathVariable Long employeeId) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmployeeDocument.class, Map.of("employeeId", employeeId)),
                HrEmployeeDocumentVO.class, objectMapper));
    }

    @SysLog("新增HR员工证件")
    @RepeatSubmit
    @PostMapping("/documents")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createDocument(@RequestBody HrEmployeeDocumentPayload payload) {
        return R.ok(crudService.create(HrEmployeeDocument.class, payload));
    }

    @SysLog("修改HR员工证件")
    @PutMapping("/documents/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateDocument(@PathVariable Long id, @RequestBody HrEmployeeDocumentPayload payload) {
        crudService.update(HrEmployeeDocument.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR员工证件")
    @DeleteMapping("/documents/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteDocument(@PathVariable Long id) {
        crudService.delete(HrEmployeeDocument.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/employees")
@RequiredArgsConstructor
class HrEmergencyContactController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/{employeeId}/emergency-contacts")
    @SaCheckPermission("hr:employees:view")
    public R<List<HrEmergencyContactVO>> listContacts(@PathVariable Long employeeId) {
        return R.ok(MapConverters.toVOList(
                crudService.list(HrEmergencyContact.class, Map.of("employeeId", employeeId)),
                HrEmergencyContactVO.class, objectMapper));
    }

    @SysLog("新增HR紧急联系人")
    @RepeatSubmit
    @PostMapping("/emergency-contacts")
    @SaCheckPermission("hr:employees:edit")
    public R<Long> createContact(@RequestBody HrEmergencyContactPayload payload) {
        return R.ok(crudService.create(HrEmergencyContact.class, payload));
    }

    @SysLog("修改HR紧急联系人")
    @PutMapping("/emergency-contacts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> updateContact(@PathVariable Long id, @RequestBody HrEmergencyContactPayload payload) {
        crudService.update(HrEmergencyContact.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR紧急联系人")
    @DeleteMapping("/emergency-contacts/{id}")
    @SaCheckPermission("hr:employees:edit")
    public R<Void> deleteContact(@PathVariable Long id) {
        crudService.delete(HrEmergencyContact.class, id);
        return R.ok();
    }
}
